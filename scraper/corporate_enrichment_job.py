import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from dotenv import load_dotenv

BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1"
OPENCNPJ_URL = "https://api.opencnpj.org"
SOURCE_BRASILAPI = "brasilapi_cnpj"
SOURCE_OPENCNPJ = "opencnpj_lookup"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_headers(service_key: str, prefer: str = "return=minimal") -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def digits_only(value: object) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def text_or_none(value: object) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    lowered = text.lower()
    if lowered in {"null", "none", "-", "nao informado", "não informado"}:
        return None
    return text


def number_or_none(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if number >= 0 else None
    text = str(value).strip()
    if not text:
        return None
    has_dot = "." in text
    has_comma = "," in text
    if has_dot and has_comma:
        text = text.replace(".", "").replace(",", ".")
    elif has_comma:
        text = text.replace(",", ".")
    try:
        number = float(text)
    except ValueError:
        return None
    return number if number >= 0 else None


def date_to_iso(value: object) -> str | None:
    text = text_or_none(value)
    if not text:
        return None
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        return text
    if len(text) == 10 and text[2] == "/" and text[5] == "/":
        dd, mm, yyyy = text.split("/")
        return f"{yyyy}-{mm}-{dd}"
    return None


def create_snapshot(
    supabase_url: str,
    service_key: str,
    source_name: str,
    watermark: str,
    metadata: dict[str, Any],
) -> str:
    endpoint = f"{supabase_url}/rest/v1/school_source_snapshots"
    payload = {
        "source_name": source_name,
        "source_version": "api_live",
        "snapshot_mode": "incremental",
        "watermark": watermark,
        "status": "running",
        "metadata": metadata,
        "started_at": now_iso(),
    }
    response = requests.post(
        endpoint,
        headers=json_headers(service_key, prefer="return=representation"),
        json=payload,
        timeout=30,
    )
    if response.status_code not in (200, 201):
        raise RuntimeError(
            f"Failed to create snapshot for {source_name} ({response.status_code}): {response.text[:500]}"
        )
    rows = response.json()
    if not rows or "id" not in rows[0]:
        raise RuntimeError(f"Snapshot creation returned no id for source {source_name}.")
    return str(rows[0]["id"])


def finalize_snapshot(
    supabase_url: str,
    service_key: str,
    snapshot_id: str,
    status: str,
    records_read: int,
    records_changed: int,
    records_upserted: int,
    error_message: str | None = None,
) -> None:
    endpoint = f"{supabase_url}/rest/v1/school_source_snapshots?id=eq.{snapshot_id}"
    payload: dict[str, Any] = {
        "status": status,
        "records_read": records_read,
        "records_changed": records_changed,
        "records_upserted": records_upserted,
        "finished_at": now_iso(),
    }
    if error_message:
        payload["error_message"] = error_message[:1800]

    response = requests.patch(endpoint, headers=json_headers(service_key), json=payload, timeout=30)
    if response.status_code not in (200, 204):
        raise RuntimeError(
            f"Failed to finalize snapshot {snapshot_id} ({response.status_code}): {response.text[:500]}"
        )


def insert_snapshot_items(
    supabase_url: str,
    service_key: str,
    items: list[dict[str, Any]],
    batch_size: int,
) -> None:
    if not items:
        return
    endpoint = f"{supabase_url}/rest/v1/school_source_snapshot_items?on_conflict=snapshot_id,entity_type,entity_id"
    headers = json_headers(service_key, prefer="resolution=merge-duplicates,return=minimal")
    for index in range(0, len(items), batch_size):
        subset = items[index : index + batch_size]
        response = requests.post(endpoint, headers=headers, json=subset, timeout=90)
        if response.status_code not in (200, 201, 204):
            raise RuntimeError(
                f"Failed to insert snapshot items ({response.status_code}): {response.text[:500]}"
            )


def fetch_leads_page(
    supabase_url: str,
    service_key: str,
    page_size: int,
    offset: int,
) -> list[dict[str, Any]]:
    select = ",".join(
        [
            "id",
            "cnpj",
            "razao_social",
            "porte",
            "cnae_principal",
            "cnae_descricao",
            "capital_social",
            "situacao_cadastral",
            "data_abertura",
            "updated_at",
        ]
    )
    endpoint = f"{supabase_url}/rest/v1/school_leads?select={select}&order=updated_at.asc,id.asc&limit={page_size}&offset={offset}"
    response = requests.get(
        endpoint,
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
        timeout=60,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Failed to fetch school_leads ({response.status_code}): {response.text[:500]}")
    return response.json()


def needs_enrichment(lead: dict[str, Any]) -> bool:
    cnpj = digits_only(lead.get("cnpj"))
    if len(cnpj) != 14:
        return False
    if not text_or_none(lead.get("razao_social")):
        return True
    if not text_or_none(lead.get("porte")):
        return True
    if not text_or_none(lead.get("cnae_principal")):
        return True
    if not text_or_none(lead.get("situacao_cadastral")):
        return True
    if number_or_none(lead.get("capital_social")) is None:
        return True
    return False


def fetch_brasilapi(cnpj: str) -> dict[str, Any] | None:
    try:
        response = requests.get(f"{BRASILAPI_URL}/{cnpj}", timeout=20)
        if response.status_code != 200:
            return None
        return response.json()
    except Exception:
        return None


def fetch_opencnpj(cnpj: str) -> dict[str, Any] | None:
    try:
        response = requests.get(f"{OPENCNPJ_URL}/{cnpj}", timeout=20)
        if response.status_code != 200:
            return None
        return response.json()
    except Exception:
        return None


def normalize_company_payload(company: dict[str, Any]) -> dict[str, Any]:
    razao_social = text_or_none(company.get("razao_social") or company.get("nome"))
    porte = text_or_none(company.get("porte") or company.get("descricao_porte"))
    cnae_principal = digits_only(company.get("cnae_fiscal") or "")
    if not cnae_principal:
        atividade_principal = company.get("atividade_principal")
        if isinstance(atividade_principal, list) and atividade_principal:
            first_item = atividade_principal[0] or {}
            cnae_principal = digits_only(first_item.get("code"))
    cnae_descricao = text_or_none(
        company.get("cnae_fiscal_descricao")
        or (
            company.get("atividade_principal", [{}])[0].get("text")
            if isinstance(company.get("atividade_principal"), list)
            else None
        )
    )
    situacao_cadastral = text_or_none(
        company.get("descricao_situacao_cadastral") or company.get("situacao_cadastral") or company.get("situacao")
    )
    capital_social = number_or_none(company.get("capital_social"))
    data_abertura = date_to_iso(company.get("data_inicio_atividade") or company.get("abertura"))

    patch = {
        "razao_social": razao_social,
        "porte": porte,
        "cnae_principal": cnae_principal or None,
        "cnae_descricao": cnae_descricao,
        "situacao_cadastral": situacao_cadastral,
        "capital_social": capital_social,
        "data_abertura": data_abertura,
        "enriched_at": now_iso(),
    }
    return patch


def has_changes(lead: dict[str, Any], patch: dict[str, Any]) -> bool:
    for key, new_value in patch.items():
        old_value = lead.get(key)
        if key == "capital_social":
            if number_or_none(old_value) != number_or_none(new_value):
                return True
            continue
        if text_or_none(old_value) != text_or_none(new_value):
            return True
    return False


def update_lead(
    supabase_url: str,
    service_key: str,
    lead_id: str,
    patch: dict[str, Any],
) -> None:
    endpoint = f"{supabase_url}/rest/v1/school_leads?id=eq.{quote(lead_id, safe='-')}"
    response = requests.patch(endpoint, headers=json_headers(service_key), json=patch, timeout=45)
    if response.status_code not in (200, 204):
        raise RuntimeError(f"Failed to update lead {lead_id} ({response.status_code}): {response.text[:300]}")


def run_quality_audit(script_dir: Path) -> None:
    audit_script = script_dir / "lead_quality_audit.py"
    subprocess.run(
        [sys.executable, str(audit_script), "--audit-version", "v1"],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Incremental corporate enrichment job (BrasilAPI + OpenCNPJ fallback) with snapshots"
    )
    parser.add_argument("--page-size", type=int, default=500, help="Pagination size for school_leads fetch")
    parser.add_argument("--batch-size", type=int, default=300, help="Batch size for snapshot item inserts")
    parser.add_argument("--max-leads", type=int, help="Optional cap for candidate leads")
    parser.add_argument("--skip-audit", action="store_true", help="Skip lead_quality_audit at the end")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without updating school_leads")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    load_dotenv(repo_root / "scraper" / ".env")
    load_dotenv(repo_root / ".env")

    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")

    if args.dry_run:
        snapshot_brasilapi_id = None
        snapshot_opencnpj_id = None
    else:
        watermark = f"corporate_enrichment:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
        snapshot_brasilapi_id = create_snapshot(
            supabase_url,
            service_key,
            SOURCE_BRASILAPI,
            watermark,
            {"job": "corporate_enrichment_job", "provider": SOURCE_BRASILAPI},
        )
        snapshot_opencnpj_id = create_snapshot(
            supabase_url,
            service_key,
            SOURCE_OPENCNPJ,
            watermark,
            {"job": "corporate_enrichment_job", "provider": SOURCE_OPENCNPJ},
        )

    counters = {
        SOURCE_BRASILAPI: {"read": 0, "changed": 0, "upserted": 0},
        SOURCE_OPENCNPJ: {"read": 0, "changed": 0, "upserted": 0},
    }
    snapshot_items: dict[str, list[dict[str, Any]]] = {
        SOURCE_BRASILAPI: [],
        SOURCE_OPENCNPJ: [],
    }

    offset = 0
    total_candidates = 0
    total_updated = 0
    page = 0

    try:
        while True:
            page += 1
            leads = fetch_leads_page(
                supabase_url=supabase_url,
                service_key=service_key,
                page_size=max(1, args.page_size),
                offset=offset,
            )
            if not leads:
                break

            candidates = [lead for lead in leads if needs_enrichment(lead)]
            if args.max_leads is not None:
                remaining = max(0, args.max_leads - total_candidates)
                candidates = candidates[:remaining]

            for lead in candidates:
                total_candidates += 1
                lead_id = str(lead.get("id") or "")
                cnpj = digits_only(lead.get("cnpj"))
                if not lead_id or len(cnpj) != 14:
                    continue

                provider = SOURCE_BRASILAPI
                payload = fetch_brasilapi(cnpj)
                if payload is None:
                    provider = SOURCE_OPENCNPJ
                    payload = fetch_opencnpj(cnpj)
                if payload is None:
                    continue

                counters[provider]["read"] += 1
                patch = normalize_company_payload(payload)
                if not has_changes(lead, patch):
                    continue

                counters[provider]["changed"] += 1
                if not args.dry_run:
                    update_lead(supabase_url, service_key, lead_id, patch)
                    counters[provider]["upserted"] += 1

                total_updated += 1
                snapshot_id = snapshot_brasilapi_id if provider == SOURCE_BRASILAPI else snapshot_opencnpj_id
                if snapshot_id:
                    entity_hash_raw = json.dumps(patch, sort_keys=True, ensure_ascii=True)
                    entity_hash = hashlib.sha256(entity_hash_raw.encode("utf-8")).hexdigest()
                    snapshot_items[provider].append(
                        {
                            "snapshot_id": snapshot_id,
                            "entity_type": "school_lead",
                            "entity_id": lead_id,
                            "entity_hash": entity_hash,
                            "payload": {
                                "cnpj": cnpj,
                                "lead_id": lead_id,
                                "provider": provider,
                                "updated_fields": patch,
                            },
                        }
                    )

            print(
                f"Page {page}: leads={len(leads)} candidates_total={total_candidates} "
                f"updated_total={total_updated}"
            )

            offset += len(leads)
            if args.max_leads is not None and total_candidates >= args.max_leads:
                break

        if not args.dry_run:
            insert_snapshot_items(supabase_url, service_key, snapshot_items[SOURCE_BRASILAPI], args.batch_size)
            insert_snapshot_items(supabase_url, service_key, snapshot_items[SOURCE_OPENCNPJ], args.batch_size)

            if snapshot_brasilapi_id:
                finalize_snapshot(
                    supabase_url=supabase_url,
                    service_key=service_key,
                    snapshot_id=snapshot_brasilapi_id,
                    status="completed",
                    records_read=counters[SOURCE_BRASILAPI]["read"],
                    records_changed=counters[SOURCE_BRASILAPI]["changed"],
                    records_upserted=counters[SOURCE_BRASILAPI]["upserted"],
                )
            if snapshot_opencnpj_id:
                finalize_snapshot(
                    supabase_url=supabase_url,
                    service_key=service_key,
                    snapshot_id=snapshot_opencnpj_id,
                    status="completed",
                    records_read=counters[SOURCE_OPENCNPJ]["read"],
                    records_changed=counters[SOURCE_OPENCNPJ]["changed"],
                    records_upserted=counters[SOURCE_OPENCNPJ]["upserted"],
                )
    except Exception as exc:
        if not args.dry_run:
            if snapshot_brasilapi_id:
                finalize_snapshot(
                    supabase_url=supabase_url,
                    service_key=service_key,
                    snapshot_id=snapshot_brasilapi_id,
                    status="failed",
                    records_read=counters[SOURCE_BRASILAPI]["read"],
                    records_changed=counters[SOURCE_BRASILAPI]["changed"],
                    records_upserted=counters[SOURCE_BRASILAPI]["upserted"],
                    error_message=str(exc),
                )
            if snapshot_opencnpj_id:
                finalize_snapshot(
                    supabase_url=supabase_url,
                    service_key=service_key,
                    snapshot_id=snapshot_opencnpj_id,
                    status="failed",
                    records_read=counters[SOURCE_OPENCNPJ]["read"],
                    records_changed=counters[SOURCE_OPENCNPJ]["changed"],
                    records_upserted=counters[SOURCE_OPENCNPJ]["upserted"],
                    error_message=str(exc),
                )
        raise

    print(
        json.dumps(
            {
                "candidates": total_candidates,
                "updated": total_updated,
                "provider_stats": counters,
                "dry_run": args.dry_run,
            },
            ensure_ascii=True,
        )
    )

    if not args.skip_audit and not args.dry_run:
        run_quality_audit(Path(__file__).resolve().parent)


if __name__ == "__main__":
    main()
