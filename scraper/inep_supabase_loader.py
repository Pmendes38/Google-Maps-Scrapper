import argparse
import os
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests
from dotenv import load_dotenv


def clean_digits(value: object) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def as_int_flag(value: object) -> int:
    return 1 if str(value or "0").strip() == "1" else 0


def as_bool_flag(value: object) -> bool:
    return str(value or "0").strip() == "1"


def normalize_nullable(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


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

    reader = pd.read_csv(
        csv_path,
        sep=";",
        encoding="latin-1",
        dtype=str,
        usecols=lambda c: c in use_cols,
        chunksize=chunk_size,
        low_memory=False,
    )

    for chunk in reader:
        # Escolas privadas (4) e em funcionamento (1)
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

            batch.append(
                {
                    "co_entidade": normalize_nullable(row.get("CO_ENTIDADE")),
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

        if batch:
            yield batch


def upsert_batch(supabase_url: str, service_key: str, records: list[dict[str, object]]) -> None:
    url = f"{supabase_url}/rest/v1/inep_schools?on_conflict=co_entidade"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    response = requests.post(url, headers=headers, json=records, timeout=120)
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Supabase upsert failed ({response.status_code}): {response.text[:500]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Carga INEP 2025 -> Supabase inep_schools")
    parser.add_argument("--csv", required=True, help="Caminho para Tabela_Escola_2025.csv")
    parser.add_argument("--chunk-size", type=int, default=15000, help="Leitura por chunk")
    parser.add_argument("--upsert-batch", type=int, default=500, help="Tamanho de lote de upsert")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / "scraper" / ".env")
    load_dotenv(root / ".env")

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no ambiente.")

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {csv_path}")

    total = 0
    chunk_num = 0

    for records in iter_records(csv_path, args.chunk_size):
        chunk_num += 1
        for i in range(0, len(records), args.upsert_batch):
            sub = records[i : i + args.upsert_batch]
            upsert_batch(supabase_url, service_key, sub)
            total += len(sub)
        print(f"Chunk {chunk_num}: {len(records)} registros privados ativos enviados (acumulado: {total})")

    print(f"Concluído. Total upsert enviado para inep_schools: {total}")


if __name__ == "__main__":
    main()
