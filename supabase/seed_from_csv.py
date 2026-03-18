#!/usr/bin/env python3
"""Seed school_leads from a scored/enriched CSV via Supabase REST API.

Usage:
  python supabase/seed_from_csv.py -i scored.csv
  python supabase/seed_from_csv.py -i enriched.csv --batch-size 200
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ALLOWED_COLUMNS = {
    "name",
    "place_type",
    "school_segment",
    "is_private",
    "phone_number",
    "phone_formatted",
    "whatsapp_ready",
    "website",
    "email",
    "address",
    "bairro",
    "city",
    "state",
    "cep",
    "latitude",
    "longitude",
    "reviews_count",
    "reviews_average",
    "opens_at",
    "place_id",
    "maps_url",
    "introduction",
    "cep_logradouro",
    "cep_bairro",
    "cep_cidade",
    "cep_uf",
    "cep_lat",
    "cep_lng",
    "cnpj",
    "razao_social",
    "situacao_cadastral",
    "data_abertura",
    "capital_social",
    "porte",
    "cnae_principal",
    "cnae_descricao",
    "socios",
    "inep_code",
    "total_matriculas",
    "matriculas_infantil",
    "matriculas_fundamental",
    "matriculas_medio",
    "ideb_ai",
    "ideb_af",
    "tem_internet",
    "tem_lab_informatica",
    "ai_score",
    "icp_match",
    "pain_points",
    "abordagem_sugerida",
    "prioridade",
    "justificativa_score",
    "scored_at",
    "pipeline_stage",
    "owner",
    "notes",
    "next_action",
    "source",
    "data_quality",
    "scraped_at",
    "enriched_at",
}

INT_COLUMNS = {
    "reviews_count",
    "total_matriculas",
    "matriculas_infantil",
    "matriculas_fundamental",
    "matriculas_medio",
    "ai_score",
}

FLOAT_COLUMNS = {
    "latitude",
    "longitude",
    "reviews_average",
    "cep_lat",
    "cep_lng",
    "capital_social",
    "ideb_ai",
    "ideb_af",
}

BOOL_COLUMNS = {"tem_internet", "tem_lab_informatica"}
JSON_COLUMNS = {"socios", "pain_points"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed school_leads from CSV")
    parser.add_argument(
        "-i",
        "--input",
        default="scored.csv",
        help="Input CSV path (default: scored.csv)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Batch size for REST upsert (default: 100)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read and normalize rows without sending to Supabase",
    )
    return parser.parse_args()


def normalize_number(value: str) -> float | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw.endswith("%"):
        raw = raw[:-1].strip()

    has_dot = "." in raw
    has_comma = "," in raw

    if has_dot and has_comma:
        raw = raw.replace(".", "").replace(",", ".")
    elif has_comma:
        raw = raw.replace(",", ".")

    try:
        return float(raw)
    except ValueError:
        return None


def normalize_bool(value: str) -> bool | None:
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if raw in {"1", "true", "t", "sim", "s", "yes", "y"}:
        return True
    if raw in {"0", "false", "f", "nao", "não", "n", "no"}:
        return False
    return None


def normalize_json(value: str) -> Any:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw in {"None", "null", "NULL"}:
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return [item.strip() for item in raw.split("|") if item.strip()]


def normalize_text(value: str) -> str | None:
    text = str(value or "").strip()
    if not text or text in {"None", "null", "NULL", "-"}:
        return None
    return text


def stable_place_id(row: dict[str, Any]) -> str:
    existing = normalize_text(str(row.get("place_id", "")))
    if existing:
        return existing

    cnpj = "".join(ch for ch in str(row.get("cnpj", "")) if ch.isdigit())
    if len(cnpj) == 14:
        return cnpj

    inep = normalize_text(str(row.get("inep_code", "")))
    if inep:
        return inep

    basis = "|".join(
        [
            normalize_text(str(row.get("name", ""))) or "",
            normalize_text(str(row.get("city", ""))) or "",
            normalize_text(str(row.get("state", ""))) or "",
            normalize_text(str(row.get("address", ""))) or "",
        ]
    )
    digest = hashlib.sha1(basis.encode("utf-8")).hexdigest()[:16]
    return f"csv_{digest}"


def normalize_row(row: dict[str, str]) -> dict[str, Any] | None:
    name = normalize_text(row.get("name", ""))
    city = normalize_text(row.get("city", ""))
    if not name or not city:
        return None

    out: dict[str, Any] = {}

    for key, value in row.items():
        if key not in ALLOWED_COLUMNS:
            continue

        if key in JSON_COLUMNS:
            out[key] = normalize_json(value)
            continue

        if key in BOOL_COLUMNS:
            out[key] = normalize_bool(value)
            continue

        if key in INT_COLUMNS:
            num = normalize_number(value)
            out[key] = int(num) if num is not None else None
            continue

        if key in FLOAT_COLUMNS:
            out[key] = normalize_number(value)
            continue

        if key == "data_quality":
            num = normalize_number(value)
            out[key] = int(num) if num is not None else None
            continue

        out[key] = normalize_text(value)

    out["name"] = name
    out["city"] = city
    out["state"] = normalize_text(row.get("state", "")) or out.get("state")
    out["place_id"] = stable_place_id(row)
    out["pipeline_stage"] = out.get("pipeline_stage") or "Novo"
    out["source"] = out.get("source") or "csv_seed"
    return out


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    encodings = ["utf-8-sig", "utf-8", "latin-1"]
    last_error: Exception | None = None
    for encoding in encodings:
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                return list(csv.DictReader(handle))
        except UnicodeDecodeError as exc:
            last_error = exc
            continue
    raise RuntimeError(f"Failed to decode CSV {path}: {last_error}")


def chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def upsert_batches(
    supabase_url: str,
    service_key: str,
    rows: list[dict[str, Any]],
    batch_size: int,
) -> None:
    url = f"{supabase_url.rstrip('/')}/rest/v1/school_leads?on_conflict=place_id"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    for index, batch in enumerate(chunked(rows, batch_size), start=1):
        payload = json.dumps(batch).encode("utf-8")
        request = urllib.request.Request(url=url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status >= 300:
                    body = response.read().decode("utf-8", errors="ignore")
                    raise RuntimeError(
                        f"Supabase upsert failed on batch {index}: "
                        f"{response.status} {body[:500]}"
                    )
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="ignore")
            raise RuntimeError(
                f"Supabase upsert failed on batch {index}: "
                f"{error.code} {body[:500]}"
            ) from error

        print(f"Batch {index}: upserted {len(batch)} rows")


def main() -> int:
    args = parse_args()
    csv_path = Path(args.input)
    if not csv_path.is_absolute():
        csv_path = (Path.cwd() / csv_path).resolve()
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1

    raw_rows = read_csv_rows(csv_path)
    normalized = [normalize_row(row) for row in raw_rows]
    rows = [row for row in normalized if row is not None]

    skipped = len(raw_rows) - len(rows)
    print(f"Loaded {len(raw_rows)} rows from {csv_path}")
    print(f"Prepared {len(rows)} rows ({skipped} skipped for missing name/city)")

    if args.dry_run:
        print("Dry run enabled. No data sent to Supabase.")
        return 0

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url:
        print("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL", file=sys.stderr)
        return 1
    if not service_key:
        print("Missing SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    upsert_batches(supabase_url, service_key, rows, max(1, args.batch_size))
    print("Seed completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
