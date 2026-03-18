import argparse
import hashlib
import json
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

import pandas as pd
import requests
from dotenv import load_dotenv

SOURCE_NAME = "inep_microdados_censo_escolar"
ENTITY_TYPE = "inep_school"


def clean_digits(value: object) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def as_int_flag(value: object) -> int:
    return 1 if str(value or "0").strip() == "1" else 0


def as_bool_flag(value: object) -> bool:
    return str(value or "0").strip() == "1"


def normalize_nullable(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def json_headers(service_key: str, prefer: str = "return=minimal") -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def current_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def compute_watermark(csv_path: Path) -> str:
    stat = csv_path.stat()
    base = f"{csv_path.name}:{stat.st_size}:{int(stat.st_mtime)}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:24]


def canonical_record_hash(record: dict[str, object]) -> str:
    payload = json.dumps(record, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def find_school_csv_member(zip_path: Path) -> str:
    with zipfile.ZipFile(zip_path, "r") as archive:
        csv_members = [name for name in archive.namelist() if name.lower().endswith(".csv")]
    if not csv_members:
        raise RuntimeError(f"No CSV found inside ZIP: {zip_path}")

    def basename(path: str) -> str:
        return path.rsplit("/", 1)[-1].lower()

    exact_table = [name for name in csv_members if basename(name).startswith("tabela_escola_")]
    if exact_table:
        exact_table.sort(key=lambda item: (len(item), item.lower()))
        return exact_table[0]

    prioritized = [
        name
        for name in csv_members
        if any(token in basename(name) for token in ["escola", "escolas", "tabela_escola"])
    ]
    pool = prioritized or csv_members
    pool.sort(key=lambda item: (0 if "escola" in basename(item) else 1, len(item), item.lower()))
    return pool[0]


def chunk_to_batch(chunk: pd.DataFrame) -> list[dict[str, object]]:
    filtered = chunk[
        (chunk["TP_DEPENDENCIA"].fillna("").astype(str) == "4")
        & (chunk["TP_SITUACAO_FUNCIONAMENTO"].fillna("").astype(str) == "1")
    ]

    batch: list[dict[str, object]] = []
    for _, row in filtered.iterrows():
        creche = as_int_flag(row.get("IN_COMUM_CRECHE"))
        pre = as_int_flag(row.get("IN_COMUM_PRE"))
        fund = as_int_flag(row.get("IN_COMUM_FUND_AI")) or as_int_flag(row.get("IN_COMUM_FUND_AF"))
        medio = (
            as_int_flag(row.get("IN_COMUM_MEDIO_MEDIO"))
            or as_int_flag(row.get("IN_COMUM_MEDIO_INTEGRADO"))
            or as_int_flag(row.get("IN_COMUM_MEDIO_FIC"))
            or as_int_flag(row.get("IN_COMUM_MEDIO_NORMAL"))
        )

        cnpj = clean_digits(row.get("NU_CNPJ_ESCOLA_PRIVADA"))
        if len(cnpj) != 14:
            cnpj = ""

        qt_mat_inf = 1 if (creche or pre) else 0
        qt_mat_fund = 1 if fund else 0
        qt_mat_med = 1 if medio else 0
        qt_mat_bas = 1 if (qt_mat_inf or qt_mat_fund or qt_mat_med) else 0

        entity_id = normalize_nullable(row.get("CO_ENTIDADE"))
        if not entity_id:
            continue

        batch.append(
            {
                "co_entidade": entity_id,
                "no_entidade": normalize_nullable(row.get("NO_ENTIDADE")),
                "cnpj": cnpj or None,
                "tp_rede": 4,
                "qt_mat_bas": qt_mat_bas,
                "qt_mat_inf": qt_mat_inf,
                "qt_mat_fund": qt_mat_fund,
                "qt_mat_med": qt_mat_med,
                "nu_ideb_ai": None,
                "nu_ideb_af": None,
                "in_internet": as_bool_flag(row.get("IN_INTERNET")),
                "in_lab_informatica": as_bool_flag(row.get("IN_LABORATORIO_INFORMATICA")),
                "tp_situacao": 1,
                "co_municipio": normalize_nullable(row.get("CO_MUNICIPIO")),
                "no_municipio": normalize_nullable(row.get("NO_MUNICIPIO")),
                "sg_uf": normalize_nullable(row.get("SG_UF")),
            }
        )
    return batch


def iter_records(csv_path: Path, chunk_size: int) -> Iterable[list[dict[str, object]]]:
    use_cols = [
        "CO_ENTIDADE",
        "NO_ENTIDADE",
        "NU_CNPJ_ESCOLA_PRIVADA",
        "TP_DEPENDENCIA",
        "TP_SITUACAO_FUNCIONAMENTO",
        "CO_MUNICIPIO",
        "NO_MUNICIPIO",
        "SG_UF",
        "IN_INTERNET",
        "IN_LABORATORIO_INFORMATICA",
        "IN_COMUM_CRECHE",
        "IN_COMUM_PRE",
        "IN_COMUM_FUND_AI",
        "IN_COMUM_FUND_AF",
        "IN_COMUM_MEDIO_MEDIO",
        "IN_COMUM_MEDIO_INTEGRADO",
        "IN_COMUM_MEDIO_FIC",
        "IN_COMUM_MEDIO_NORMAL",
    ]

    read_kwargs = {
        "sep": ";",
        "encoding": "latin-1",
        "dtype": str,
        "usecols": lambda c: c in use_cols,
        "chunksize": chunk_size,
        "low_memory": False,
    }

    if csv_path.suffix.lower() == ".zip":
        member = find_school_csv_member(csv_path)
        with zipfile.ZipFile(csv_path, "r") as archive:
            with archive.open(member) as zipped_csv:
                reader = pd.read_csv(zipped_csv, **read_kwargs)
                for chunk in reader:
                    batch = chunk_to_batch(chunk)
                    if batch:
                        yield batch
        return

    reader = pd.read_csv(csv_path, **read_kwargs)
    for chunk in reader:
        batch = chunk_to_batch(chunk)
        if batch:
            yield batch


def create_snapshot(
    supabase_url: str,
    service_key: str,
    source_version: str | None,
    mode: str,
    watermark: str | None,
    csv_path: Path,
) -> str:
    url = f"{supabase_url}/rest/v1/school_source_snapshots"
    payload = {
        "source_name": SOURCE_NAME,
        "source_version": source_version,
        "snapshot_mode": mode,
        "watermark": watermark,
        "status": "running",
        "metadata": {"csv_path": str(csv_path), "created_by": "inep_supabase_loader.py"},
    }
    headers = json_headers(service_key, prefer="return=representation")
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    if response.status_code not in (200, 201):
        raise RuntimeError(
            f"Failed to create snapshot ({response.status_code}): {response.text[:500]}"
        )
    rows = response.json()
    if not rows or "id" not in rows[0]:
        raise RuntimeError("Snapshot creation returned no id.")
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
    extra_metadata: dict[str, object] | None = None,
) -> None:
    url = f"{supabase_url}/rest/v1/school_source_snapshots?id=eq.{snapshot_id}"
    payload: dict[str, object] = {
        "status": status,
        "records_read": records_read,
        "records_changed": records_changed,
        "records_upserted": records_upserted,
        "finished_at": current_iso(),
    }
    if error_message:
        payload["error_message"] = error_message[:2000]
    if extra_metadata:
        payload["metadata"] = extra_metadata

    headers = json_headers(service_key)
    response = requests.patch(url, headers=headers, json=payload, timeout=30)
    if response.status_code not in (200, 204):
        raise RuntimeError(
            f"Failed to finalize snapshot ({response.status_code}): {response.text[:500]}"
        )


def fetch_existing_hashes(
    supabase_url: str,
    service_key: str,
    entity_ids: list[str],
    lookup_batch: int,
) -> dict[str, str]:
    out: dict[str, str] = {}
    endpoint = f"{supabase_url}/rest/v1/inep_schools"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }

    for i in range(0, len(entity_ids), lookup_batch):
        subset = entity_ids[i : i + lookup_batch]
        if not subset:
            continue
        quoted_ids: list[str] = []
        for value in subset:
            clean_value = str(value).replace('"', "")
            quoted_ids.append(f'"{clean_value}"')
        in_clause = ",".join(quoted_ids)
        encoded = quote(f"in.({in_clause})", safe="(),.")
        url = f"{endpoint}?select=co_entidade,source_hash&co_entidade={encoded}"
        response = requests.get(url, headers=headers, timeout=60)
        if response.status_code != 200:
            raise RuntimeError(
                f"Failed to fetch existing hashes ({response.status_code}): {response.text[:500]}"
            )
        for row in response.json():
            key = str(row.get("co_entidade") or "")
            if not key:
                continue
            out[key] = str(row.get("source_hash") or "")
    return out


def upsert_inep_batch(
    supabase_url: str,
    service_key: str,
    records: list[dict[str, object]],
) -> None:
    url = f"{supabase_url}/rest/v1/inep_schools?on_conflict=co_entidade"
    headers = json_headers(service_key, prefer="resolution=merge-duplicates,return=minimal")
    response = requests.post(url, headers=headers, json=records, timeout=120)
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Supabase upsert failed ({response.status_code}): {response.text[:500]}")


def insert_snapshot_items(
    supabase_url: str,
    service_key: str,
    items: list[dict[str, object]],
    batch_size: int,
) -> None:
    if not items:
        return
    url = f"{supabase_url}/rest/v1/school_source_snapshot_items?on_conflict=snapshot_id,entity_type,entity_id"
    headers = json_headers(service_key, prefer="resolution=merge-duplicates,return=minimal")

    for i in range(0, len(items), batch_size):
        subset = items[i : i + batch_size]
        response = requests.post(url, headers=headers, json=subset, timeout=120)
        if response.status_code not in (200, 201, 204):
            raise RuntimeError(
                f"Snapshot items upsert failed ({response.status_code}): {response.text[:500]}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Incremental INEP loader -> Supabase inep_schools + source snapshots"
    )
    parser.add_argument("--csv", required=True, help="Path to INEP CSV or official INEP ZIP file")
    parser.add_argument("--chunk-size", type=int, default=15000, help="CSV read chunk size")
    parser.add_argument("--lookup-batch", type=int, default=300, help="Batch size for hash lookups")
    parser.add_argument("--upsert-batch", type=int, default=500, help="Batch size for upsert")
    parser.add_argument(
        "--mode",
        choices=["incremental", "full"],
        default="incremental",
        help="Incremental uploads only changed/new records; full uploads all filtered rows",
    )
    parser.add_argument("--source-version", default="2025", help="Source version label")
    parser.add_argument("--watermark", help="Optional source watermark")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / "scraper" / ".env")
    load_dotenv(root / ".env")

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")

    csv_path = Path(args.csv)
    if not csv_path.exists():
        candidates = sorted(Path.cwd().glob("*.csv")) + sorted(Path.cwd().glob("*.zip"))
        hint = ", ".join(path.name for path in candidates[:12]) or "none"
        raise FileNotFoundError(f"File not found: {csv_path}. Available in cwd: {hint}")

    watermark = args.watermark or compute_watermark(csv_path)
    snapshot_id = create_snapshot(
        supabase_url=supabase_url,
        service_key=service_key,
        source_version=args.source_version,
        mode=args.mode,
        watermark=watermark,
        csv_path=csv_path,
    )

    total_read = 0
    total_changed = 0
    total_upserted = 0
    chunk_num = 0

    try:
        for records in iter_records(csv_path, args.chunk_size):
            chunk_num += 1
            total_read += len(records)

            entity_ids = [str(record["co_entidade"]) for record in records]
            existing_hashes = {}
            if args.mode == "incremental":
                existing_hashes = fetch_existing_hashes(
                    supabase_url=supabase_url,
                    service_key=service_key,
                    entity_ids=entity_ids,
                    lookup_batch=args.lookup_batch,
                )

            changed_records: list[dict[str, object]] = []
            snapshot_items: list[dict[str, object]] = []
            for record in records:
                entity_id = str(record["co_entidade"])
                entity_hash = canonical_record_hash(record)
                previous_hash = existing_hashes.get(entity_id, "")

                if args.mode == "incremental" and previous_hash == entity_hash:
                    continue

                enriched = {
                    **record,
                    "source_name": SOURCE_NAME,
                    "source_hash": entity_hash,
                    "source_last_ingested_at": current_iso(),
                    "source_snapshot_id": snapshot_id,
                }
                changed_records.append(enriched)
                snapshot_items.append(
                    {
                        "snapshot_id": snapshot_id,
                        "entity_type": ENTITY_TYPE,
                        "entity_id": entity_id,
                        "entity_hash": entity_hash,
                        "payload": record,
                    }
                )

            total_changed += len(changed_records)
            if changed_records:
                for i in range(0, len(changed_records), args.upsert_batch):
                    subset = changed_records[i : i + args.upsert_batch]
                    upsert_inep_batch(supabase_url, service_key, subset)
                    total_upserted += len(subset)

                insert_snapshot_items(
                    supabase_url=supabase_url,
                    service_key=service_key,
                    items=snapshot_items,
                    batch_size=args.upsert_batch,
                )

            print(
                f"Chunk {chunk_num}: read={len(records)} changed={len(changed_records)} "
                f"upserted_total={total_upserted}"
            )

        finalize_snapshot(
            supabase_url=supabase_url,
            service_key=service_key,
            snapshot_id=snapshot_id,
            status="completed",
            records_read=total_read,
            records_changed=total_changed,
            records_upserted=total_upserted,
            extra_metadata={
                "csv_path": str(csv_path),
                "mode": args.mode,
                "source_version": args.source_version,
                "watermark": watermark,
            },
        )
    except Exception as exc:
        finalize_snapshot(
            supabase_url=supabase_url,
            service_key=service_key,
            snapshot_id=snapshot_id,
            status="failed",
            records_read=total_read,
            records_changed=total_changed,
            records_upserted=total_upserted,
            error_message=str(exc),
            extra_metadata={
                "csv_path": str(csv_path),
                "mode": args.mode,
                "source_version": args.source_version,
                "watermark": watermark,
            },
        )
        raise

    print(
        "Done. "
        f"snapshot_id={snapshot_id} read={total_read} changed={total_changed} upserted={total_upserted}"
    )


if __name__ == "__main__":
    main()
