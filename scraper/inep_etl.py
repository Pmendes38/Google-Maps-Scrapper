import argparse
import re
import zipfile
from pathlib import Path

import pandas as pd
from fuzzywuzzy import fuzz

try:
    from scraper.validators import normalize_text
except ModuleNotFoundError:
    from validators import normalize_text


INEP_ENCODING = "latin-1"
INEP_SEP = ";"
INEP_COLS = [
    "CO_ENTIDADE",
    "NO_ENTIDADE",
    "CNPJ_ESCOLA",
    "TP_REDE",
    "TP_SITUACAO_FUNCIONAMENTO",
    "QT_MAT_BAS",
    "QT_MAT_INF",
    "QT_MAT_FUND",
    "QT_MAT_MED",
    "NU_IDEB_AI",
    "NU_IDEB_AF",
    "IN_INTERNET",
    "IN_LABORATORIO_INFORMATICA",
    "CO_MUNICIPIO",
    "NO_MUNICIPIO",
    "SG_UF",
]
FILTRO_REDE = 4
FILTRO_SITUACAO = 1


def load_inep_csv(zip_path: str) -> pd.DataFrame:
    """Extrai e carrega o CSV principal do INEP já filtrando privadas ativas."""
    with zipfile.ZipFile(zip_path, "r") as zip_file:
        csv_files = [file_name for file_name in zip_file.namelist() if file_name.endswith(".csv") and "escola" in file_name.lower()]
        if not csv_files:
            raise FileNotFoundError("Nenhum CSV de escolas foi encontrado dentro do ZIP do INEP.")
        with zip_file.open(csv_files[0]) as csv_stream:
            dataframe = pd.read_csv(csv_stream, sep=INEP_SEP, encoding=INEP_ENCODING, usecols=INEP_COLS, low_memory=False)
    return dataframe[(dataframe["TP_REDE"] == FILTRO_REDE) & (dataframe["TP_SITUACAO_FUNCIONAMENTO"] == FILTRO_SITUACAO)].copy()


def match_with_inep(lead_cnpj: str, lead_name: str, inep_df: pd.DataFrame) -> dict[str, str]:
    """Faz match por CNPJ exato ou nome fuzzy e devolve campos de enriquecimento."""
    cnpj_clean = re.sub(r"\D", "", lead_cnpj or "")
    if cnpj_clean:
        cnpj_matches = inep_df[inep_df["CNPJ_ESCOLA"].astype(str).str.replace(r"\D", "", regex=True) == cnpj_clean]
        if not cnpj_matches.empty:
            return _row_to_dict(cnpj_matches.iloc[0])

    if lead_name:
        scored = inep_df.copy()
        normalized_lead_name = normalize_text(lead_name)
        scored["_score"] = scored["NO_ENTIDADE"].astype(str).apply(lambda school_name: fuzz.token_sort_ratio(normalize_text(school_name), normalized_lead_name))
        best = scored.nlargest(1, "_score")
        if not best.empty and int(best.iloc[0]["_score"]) >= 85:
            return _row_to_dict(best.iloc[0])
    return {}


def enrich_leads_csv_with_inep(leads_path: str, inep_df: pd.DataFrame, output_path: str) -> None:
    """Enriquece um CSV de leads com campos do INEP quando houver match."""
    leads_df = pd.read_csv(leads_path)
    enriched_rows = []
    for _, row in leads_df.iterrows():
        enrichment = match_with_inep(str(row.get("cnpj", "")), str(row.get("name", "")), inep_df)
        enriched_rows.append({**row.to_dict(), **enrichment})
    pd.DataFrame(enriched_rows).to_csv(output_path, index=False)


def _row_to_dict(row: pd.Series) -> dict[str, str]:
    return {
        "inep_code": str(row.get("CO_ENTIDADE", "") or ""),
        "total_matriculas": str(row.get("QT_MAT_BAS", "") or ""),
        "matriculas_infantil": str(row.get("QT_MAT_INF", "") or ""),
        "matriculas_fundamental": str(row.get("QT_MAT_FUND", "") or ""),
        "matriculas_medio": str(row.get("QT_MAT_MED", "") or ""),
        "ideb_ai": str(row.get("NU_IDEB_AI", "") or ""),
        "ideb_af": str(row.get("NU_IDEB_AF", "") or ""),
        "tem_internet": "Sim" if row.get("IN_INTERNET") == 1 else "Não",
        "tem_lab_informatica": "Sim" if row.get("IN_LABORATORIO_INFORMATICA") == 1 else "Não",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="ETL do Censo Escolar INEP 2025")
    parser.add_argument("--zip", required=True, help="Caminho para o ZIP dos microdados INEP")
    parser.add_argument("--output", required=True, help="CSV de saída com escolas privadas ativas")
    parser.add_argument("--leads-input", help="CSV de leads para enriquecimento por match")
    parser.add_argument("--leads-output", help="CSV de saída dos leads enriquecidos")
    args = parser.parse_args()

    inep_df = load_inep_csv(args.zip)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    inep_df.to_csv(args.output, index=False)

    if args.leads_input and args.leads_output:
        enrich_leads_csv_with_inep(args.leads_input, inep_df, args.leads_output)


if __name__ == "__main__":
    main()
