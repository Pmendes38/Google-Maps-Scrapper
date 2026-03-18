import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from dotenv import load_dotenv

SOURCE_NAME = "inep_microdados_censo_escolar"
DEFAULT_AUDIT_VERSION = "v1"


def json_headers(service_key: str, prefer: str = "return=minimal") -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def digits_only(value: object) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def text_or_none(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    lowered = text.lower()
    if lowered in {"-", "null", "none", "nao informado", "não informado", "indefinido"}:
        return None
    return text


def bool_present(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return True
    return text_or_none(value) is not None


def parse_iso_datetime(value: object) -> datetime | None:
    text = text_or_none(value)
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def is_valid_email(value: object) -> bool:
    text = text_or_none(value)
    return bool(text and "@" in text and "." in text.split("@")[-1])


def is_valid_website(value: object) -> bool:
    text = text_or_none(value)
    if not text:
        return False
    lowered = text.lower()
    return lowered.startswith("http://") or lowered.startswith("https://") or "." in lowered


def is_valid_phone(value: object, phone_formatted: object) -> bool:
    raw = digits_only(value) or digits_only(phone_formatted)
    return len(raw) >= 10


def is_valid_cnpj(value: object) -> bool:
    return len(digits_only(value)) == 14


def is_valid_cep(value: object) -> bool:
    return len(digits_only(value)) == 8


def is_valid_inep(value: object) -> bool:
    digits = digits_only(value)
    return len(digits) >= 6


def is_valid_segment(value: object) -> bool:
    text = text_or_none(value)
    if not text:
        return False
    lowered = text.lower()
    return lowered not in {"indefinido", "nao informado", "não informado"}


def is_valid_private_flag(value: object) -> bool:
    text = text_or_none(value)
    if not text:
        return False
    return text.lower() in {"sim", "nao", "não", "true", "false", "privada", "publica", "pública"}


def is_valid_icp(value: object) -> bool:
    text = text_or_none(value)
    if not text:
        return False
    return text.lower() in {"alto", "medio", "médio", "baixo"}


def is_valid_score(value: object) -> bool:
    if value is None:
        return False
    try:
        score = float(value)
    except (TypeError, ValueError):
        return False
    return 0 <= score <= 100


def is_positive_number(value: object) -> bool:
    if value is None:
        return False
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def evaluate_lead(lead: dict[str, Any], snapshot_id: str | None, audit_version: str) -> dict[str, Any]:
    checks = [
        {
            "flag": "has_name",
            "weight": 8,
            "present": bool_present(lead.get("name")),
            "issue_code": "missing_name",
            "issue": "Nome da escola ausente.",
            "action": "Validar nome no Google Maps/INEP e atualizar o lead.",
            "severity": "high",
        },
        {
            "flag": "has_place_id",
            "weight": 6,
            "present": bool_present(lead.get("place_id")),
            "issue_code": "missing_place_id",
            "issue": "Identificador place_id ausente.",
            "action": "Gerar place_id estavel para suportar upsert e deduplicacao.",
            "severity": "high",
        },
        {
            "flag": "has_cnpj_valid",
            "weight": 8,
            "present": is_valid_cnpj(lead.get("cnpj")),
            "issue_code": "missing_or_invalid_cnpj",
            "issue": "CNPJ ausente ou invalido.",
            "action": "Enriquecer via BrasilAPI/Receita e normalizar para 14 digitos.",
            "severity": "high",
        },
        {
            "flag": "has_inep_code_valid",
            "weight": 8,
            "present": is_valid_inep(lead.get("inep_code")),
            "issue_code": "missing_or_invalid_inep_code",
            "issue": "Codigo INEP ausente ou invalido.",
            "action": "Cruzar com microdados do INEP e preencher codigo da escola.",
            "severity": "high",
        },
        {
            "flag": "has_phone",
            "weight": 10,
            "present": is_valid_phone(lead.get("phone_number"), lead.get("phone_formatted")),
            "issue_code": "missing_phone",
            "issue": "Telefone ausente ou invalido.",
            "action": "Coletar telefone no site oficial ou Google Maps.",
            "severity": "high",
        },
        {
            "flag": "has_email",
            "weight": 8,
            "present": is_valid_email(lead.get("email")),
            "issue_code": "missing_email",
            "issue": "Email nao identificado.",
            "action": "Executar crawler de contato e validar dominio da escola.",
            "severity": "medium",
        },
        {
            "flag": "has_website",
            "weight": 5,
            "present": is_valid_website(lead.get("website")),
            "issue_code": "missing_website",
            "issue": "Site institucional ausente.",
            "action": "Buscar URL no Google Maps e validar pagina ativa.",
            "severity": "medium",
        },
        {
            "flag": "has_address",
            "weight": 8,
            "present": bool_present(lead.get("address")),
            "issue_code": "missing_address",
            "issue": "Endereco ausente.",
            "action": "Completar endereco com geocoding por CEP/Maps.",
            "severity": "high",
        },
        {
            "flag": "has_city",
            "weight": 6,
            "present": bool_present(lead.get("city")),
            "issue_code": "missing_city",
            "issue": "Cidade nao preenchida.",
            "action": "Normalizar municipio com base no IBGE/INEP.",
            "severity": "medium",
        },
        {
            "flag": "has_state",
            "weight": 3,
            "present": bool_present(lead.get("state")),
            "issue_code": "missing_state",
            "issue": "UF nao preenchida.",
            "action": "Inferir UF pelo municipio ou CEP.",
            "severity": "medium",
        },
        {
            "flag": "has_cep_valid",
            "weight": 4,
            "present": is_valid_cep(lead.get("cep")),
            "issue_code": "missing_or_invalid_cep",
            "issue": "CEP ausente ou invalido.",
            "action": "Normalizar CEP para 8 digitos com BrasilAPI/ViaCEP.",
            "severity": "medium",
        },
        {
            "flag": "has_school_segment",
            "weight": 5,
            "present": is_valid_segment(lead.get("school_segment")),
            "issue_code": "missing_school_segment",
            "issue": "Segmento escolar ausente.",
            "action": "Classificar segmento com heuristica baseada em nome e etapa.",
            "severity": "medium",
        },
        {
            "flag": "has_is_private",
            "weight": 3,
            "present": is_valid_private_flag(lead.get("is_private")),
            "issue_code": "missing_is_private",
            "issue": "Dependencia administrativa nao definida.",
            "action": "Inferir se a escola e privada/publica no enriquecimento.",
            "severity": "low",
        },
        {
            "flag": "has_ai_score",
            "weight": 4,
            "present": is_valid_score(lead.get("ai_score")),
            "issue_code": "missing_ai_score",
            "issue": "Score comercial nao calculado.",
            "action": "Executar motor de scoring heuristico/IA.",
            "severity": "low",
        },
        {
            "flag": "has_icp_match",
            "weight": 4,
            "present": is_valid_icp(lead.get("icp_match")),
            "issue_code": "missing_icp_match",
            "issue": "Classificacao ICP nao preenchida.",
            "action": "Definir ICP match com base em porte, etapa e sinais digitais.",
            "severity": "low",
        },
        {
            "flag": "has_total_matriculas",
            "weight": 4,
            "present": is_positive_number(lead.get("total_matriculas")),
            "issue_code": "missing_total_matriculas",
            "issue": "Total de matriculas ausente.",
            "action": "Cruzar com microdados INEP para preencher matriculas.",
            "severity": "medium",
        },
        {
            "flag": "has_capital_social",
            "weight": 3,
            "present": is_positive_number(lead.get("capital_social")),
            "issue_code": "missing_capital_social",
            "issue": "Capital social ausente.",
            "action": "Consultar CNPJ na BrasilAPI/Receita para completar dados empresariais.",
            "severity": "low",
        },
        {
            "flag": "has_cnae",
            "weight": 3,
            "present": bool_present(lead.get("cnae_principal")),
            "issue_code": "missing_cnae",
            "issue": "CNAE principal ausente.",
            "action": "Atualizar CNAE via consulta empresarial do CNPJ.",
            "severity": "low",
        },
    ]

    score = sum(item["weight"] for item in checks if item["present"])
    presence_flags = {item["flag"]: bool(item["present"]) for item in checks}

    issues: list[dict[str, str]] = []
    recommended_actions: list[dict[str, str]] = []
    action_codes: set[str] = set()

    for item in checks:
        if item["present"]:
            continue
        issues.append(
            {
                "code": item["issue_code"],
                "message": item["issue"],
                "severity": item["severity"],
            }
        )
        if item["issue_code"] not in action_codes:
            recommended_actions.append(
                {
                    "code": item["issue_code"],
                    "action": item["action"],
                }
            )
            action_codes.add(item["issue_code"])

    return {
        "lead_id": lead["id"],
        "audit_version": audit_version,
        "quality_score": int(round(score)),
        "presence_flags": presence_flags,
        "issues": issues,
        "recommended_actions": recommended_actions,
        "source_snapshot_id": snapshot_id,
        "audited_at": now_iso(),
    }


def find_latest_snapshot_id(supabase_url: str, service_key: str, source_name: str) -> str | None:
    endpoint = (
        f"{supabase_url}/rest/v1/school_source_snapshots"
        f"?select=id&source_name=eq.{quote(source_name)}&status=eq.completed"
        "&order=finished_at.desc.nullslast,started_at.desc&limit=1"
    )
    response = requests.get(
        endpoint,
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"Failed to fetch latest snapshot ({response.status_code}): {response.text[:500]}"
        )
    rows = response.json()
    if not rows:
        return None
    return str(rows[0].get("id") or "") or None


def fetch_leads_page(
    supabase_url: str,
    service_key: str,
    page_size: int,
    offset: int,
) -> list[dict[str, Any]]:
    select = ",".join(
        [
            "id",
            "name",
            "place_id",
            "cnpj",
            "inep_code",
            "phone_number",
            "phone_formatted",
            "email",
            "website",
            "address",
            "city",
            "state",
            "cep",
            "school_segment",
            "is_private",
            "ai_score",
            "icp_match",
            "total_matriculas",
            "capital_social",
            "cnae_principal",
            "updated_at",
        ]
    )
    endpoint = (
        f"{supabase_url}/rest/v1/school_leads"
        f"?select={select}&order=updated_at.asc.nullslast,id.asc&limit={page_size}&offset={offset}"
    )
    response = requests.get(
        endpoint,
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
        timeout=60,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Failed to fetch school_leads ({response.status_code}): {response.text[:500]}")
    return response.json()


def fetch_audits_map(
    supabase_url: str,
    service_key: str,
    lead_ids: list[str],
) -> dict[str, dict[str, Any]]:
    if not lead_ids:
        return {}
    endpoint = f"{supabase_url}/rest/v1/school_lead_quality_audits"
    out: dict[str, dict[str, Any]] = {}
    for i in range(0, len(lead_ids), 300):
        subset = lead_ids[i : i + 300]
        quoted_ids: list[str] = []
        for value in subset:
            clean_value = str(value).replace('"', "")
            quoted_ids.append(f'"{clean_value}"')
        in_clause = ",".join(quoted_ids)
        encoded = quote(f"in.({in_clause})", safe="(),.")
        url = f"{endpoint}?select=lead_id,audited_at,audit_version&lead_id={encoded}"
        response = requests.get(
            url,
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
            timeout=60,
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"Failed to fetch existing audits ({response.status_code}): {response.text[:500]}"
            )
        for row in response.json():
            lead_id = str(row.get("lead_id") or "")
            if lead_id:
                out[lead_id] = row
    return out


def upsert_audits(
    supabase_url: str,
    service_key: str,
    audits: list[dict[str, Any]],
    batch_size: int,
) -> int:
    if not audits:
        return 0
    endpoint = f"{supabase_url}/rest/v1/school_lead_quality_audits?on_conflict=lead_id"
    headers = json_headers(service_key, prefer="resolution=merge-duplicates,return=minimal")
    total = 0
    for i in range(0, len(audits), batch_size):
        subset = audits[i : i + batch_size]
        response = requests.post(endpoint, headers=headers, json=subset, timeout=90)
        if response.status_code not in (200, 201, 204):
            raise RuntimeError(f"Failed to upsert audits ({response.status_code}): {response.text[:500]}")
        total += len(subset)
    return total


def update_lead_quality_score(
    supabase_url: str,
    service_key: str,
    audits: list[dict[str, Any]],
    batch_size: int,
) -> int:
    if not audits:
        return 0
    headers = json_headers(service_key)
    total = 0
    for audit in audits:
        lead_id = quote(str(audit["lead_id"]), safe="-")
        endpoint = f"{supabase_url}/rest/v1/school_leads?id=eq.{lead_id}"
        payload = {"data_quality": audit["quality_score"]}
        response = requests.patch(endpoint, headers=headers, json=payload, timeout=45)
        if response.status_code not in (200, 204):
            raise RuntimeError(
                f"Failed to update school_leads.data_quality ({response.status_code}): {response.text[:500]}"
            )
        total += 1
    return total


def should_reaudit(
    lead: dict[str, Any],
    existing_audit: dict[str, Any] | None,
    audit_version: str,
    force: bool,
) -> bool:
    if force:
        return True
    if not existing_audit:
        return True
    if str(existing_audit.get("audit_version") or "") != audit_version:
        return True
    lead_updated = parse_iso_datetime(lead.get("updated_at"))
    last_audited = parse_iso_datetime(existing_audit.get("audited_at"))
    if not lead_updated or not last_audited:
        return True
    return lead_updated > last_audited


def main() -> None:
    parser = argparse.ArgumentParser(description="Lead quality auditing for Supabase school_leads")
    parser.add_argument("--page-size", type=int, default=1000, help="Page size for lead fetching")
    parser.add_argument("--batch-size", type=int, default=500, help="Batch size for upserts")
    parser.add_argument(
        "--audit-version",
        default=DEFAULT_AUDIT_VERSION,
        help=f"Audit algorithm version (default: {DEFAULT_AUDIT_VERSION})",
    )
    parser.add_argument(
        "--snapshot-id",
        help="Optional source snapshot id to attach to all audits",
    )
    parser.add_argument(
        "--source-name",
        default=SOURCE_NAME,
        help=f"Source used for auto snapshot lookup (default: {SOURCE_NAME})",
    )
    parser.add_argument(
        "--skip-update-leads",
        action="store_true",
        help="Do not propagate quality_score into school_leads.data_quality",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reaudit all leads even if unchanged since last audit",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / "scraper" / ".env")
    load_dotenv(root / ".env")

    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")

    snapshot_id = args.snapshot_id
    if not snapshot_id:
        snapshot_id = find_latest_snapshot_id(supabase_url, service_key, args.source_name)

    total_leads = 0
    total_candidates = 0
    total_audited = 0
    total_quality_updates = 0
    offset = 0
    page = 0

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

        total_leads += len(leads)
        lead_ids = [str(lead.get("id") or "") for lead in leads if lead.get("id")]
        existing_audits = fetch_audits_map(supabase_url, service_key, lead_ids)

        candidates: list[dict[str, Any]] = []
        for lead in leads:
            lead_id = str(lead.get("id") or "")
            if not lead_id:
                continue
            if should_reaudit(
                lead=lead,
                existing_audit=existing_audits.get(lead_id),
                audit_version=args.audit_version,
                force=args.force,
            ):
                candidates.append(lead)

        audits = [evaluate_lead(lead, snapshot_id, args.audit_version) for lead in candidates]
        total_candidates += len(candidates)
        total_audited += upsert_audits(supabase_url, service_key, audits, max(1, args.batch_size))
        if not args.skip_update_leads:
            total_quality_updates += update_lead_quality_score(
                supabase_url,
                service_key,
                audits,
                max(1, args.batch_size),
            )

        print(
            f"Page {page}: leads={len(leads)} candidates={len(candidates)} "
            f"audited_total={total_audited}"
        )
        offset += len(leads)

    summary = {
        "audit_version": args.audit_version,
        "snapshot_id": snapshot_id,
        "total_leads": total_leads,
        "total_candidates": total_candidates,
        "total_audited": total_audited,
        "total_quality_updates": total_quality_updates,
        "mode": "force" if args.force else "incremental",
        "updated_at": now_iso(),
    }
    print(json.dumps(summary, ensure_ascii=True))


if __name__ == "__main__":
    main()
