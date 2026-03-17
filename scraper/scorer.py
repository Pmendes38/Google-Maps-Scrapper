"""
scraper/scorer.py - Motor de scoring via Claude API.

Uso:
    python scraper/scorer.py -i enriched.csv -o scored.csv
    python scraper/scorer.py -i enriched.csv -o scored.csv --min-quality 60
    python scraper/scorer.py -i enriched.csv -o scored.csv --batch-size 30
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from typing import Any, List

import anthropic
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

SYSTEM_PROMPT = """
Voce e especialista em prospeccao B2B para o setor educacional brasileiro.
Analise dados de escolas privadas e retorne avaliacao estruturada.

ICP da Wayzen: escola privada de educacao basica (infantil, fundamental ou medio),
ativa 3-20 anos, 100-2.000 alunos, capital social > R$50k, sem processo comercial definido.

Criterios de scoring (100 pts total):
- Matriculas:     ate 25 pts | <100=5, 100-500=12, 500-1000=18, 1000+=25
- Capital social: ate 20 pts | <50k=0, 50-200k=10, 200-500k=15, 500k+=20
- Rating Google:  ate 20 pts | <3.5=5, 3.5-4.0=12, 4.0-4.5=16, 4.5+=20
- Segmento ICP:   ate 20 pts | fundamental/medio=20, tecnico=15, superior=10
- Maturidade:     ate 15 pts | <3a=3, 3-5a=8, 5-15a=15, 15+a=10

Retorne APENAS JSON valido. Sem markdown. Sem texto fora do JSON.
"""

USER_TEMPLATE = """
Analise as escolas e retorne um array JSON com um objeto por escola:
{leads_json}

Formato exato de cada objeto:
{{
  "idx": <mesmo indice recebido>,
  "score": <inteiro 0-100>,
  "icp_match": "<alto|medio|baixo>",
  "pain_points": ["<dor 1>", "<dor 2>"],
  "abordagem_sugerida": "<2-3 frases para WhatsApp>",
  "prioridade": "<imediata|normal|baixa>",
  "justificativa_score": "<1 frase explicando o score>"
}}
"""


def _safe_value(row: dict[str, Any], key: str, default: Any = "desconhecido") -> Any:
    value = row.get(key, default)
    if value in ("", None, "nan", "None"):
        return default
    return value


def _parse_data_quality(value: Any) -> float:
    if value is None:
        return 0.0
    text = str(value).strip().replace("%", "")
    try:
        return float(text)
    except ValueError:
        return 0.0


def build_payload(row: dict[str, Any], idx: int) -> dict[str, Any]:
    return {
        "idx": idx,
        "nome": _safe_value(row, "name"),
        "segmento": _safe_value(row, "school_segment"),
        "is_private": _safe_value(row, "is_private"),
        "total_matriculas": _safe_value(row, "total_matriculas"),
        "capital_social": _safe_value(row, "capital_social"),
        "rating_google": _safe_value(row, "reviews_average"),
        "reviews": _safe_value(row, "reviews_count", 0),
        "porte": _safe_value(row, "porte"),
        "data_abertura": _safe_value(row, "data_abertura"),
        "cnae": _safe_value(row, "cnae_descricao", _safe_value(row, "school_segment")),
        "situacao": _safe_value(row, "situacao_cadastral", "Ativa"),
        "tem_website": bool(_safe_value(row, "website", "")),
        "whatsapp_ready": _safe_value(row, "whatsapp_ready") == "Sim",
        "ideb": _safe_value(row, "ideb_af", _safe_value(row, "ideb_ai")),
    }


def score_batch(payloads: List[dict[str, Any]], client: anthropic.Anthropic) -> List[dict[str, Any]]:
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": USER_TEMPLATE.format(leads_json=json.dumps(payloads, ensure_ascii=False, indent=2)),
            }
        ],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def score_csv(input_path: str, output_path: str, batch_size: int = 40, min_quality: int = 0) -> None:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY nao encontrado no ambiente.")

    client = anthropic.Anthropic(api_key=api_key)
    dataframe = pd.read_csv(input_path)
    logging.info("Carregados %s leads", len(dataframe))

    if min_quality > 0 and "data_quality" in dataframe.columns:
        dataframe["_dq"] = dataframe["data_quality"].apply(_parse_data_quality)
        dataframe = dataframe[dataframe["_dq"] >= min_quality].drop(columns=["_dq"])
        logging.info("Apos filtro >=%s%%: %s leads", min_quality, len(dataframe))

    total_scored = 0
    for i in range(0, len(dataframe), batch_size):
        batch = dataframe.iloc[i : i + batch_size]
        payloads = [build_payload(row.to_dict(), idx) for idx, row in batch.iterrows()]
        logging.info("Batch %s: %s leads...", (i // batch_size) + 1, len(payloads))
        try:
            scores = score_batch(payloads, client)
            for score in scores:
                idx = score["idx"]
                dataframe.at[idx, "ai_score"] = str(score.get("score", ""))
                dataframe.at[idx, "icp_match"] = score.get("icp_match", "")
                dataframe.at[idx, "pain_points"] = json.dumps(score.get("pain_points", []), ensure_ascii=False)
                dataframe.at[idx, "abordagem_sugerida"] = score.get("abordagem_sugerida", "")
                dataframe.at[idx, "prioridade"] = score.get("prioridade", "")
                dataframe.at[idx, "justificativa_score"] = score.get("justificativa_score", "")
            total_scored += len(scores)
            logging.info("  OK %s/%s", total_scored, len(dataframe))
        except Exception as exc:
            logging.error("  Falha no batch: %s", exc)

    dataframe.to_csv(output_path, index=False, encoding="utf-8-sig")
    logging.info("Salvo: %s", output_path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input", required=True)
    parser.add_argument("-o", "--output", required=True)
    parser.add_argument("--batch-size", type=int, default=40)
    parser.add_argument("--min-quality", type=int, default=0)
    args = parser.parse_args()
    score_csv(args.input, args.output, args.batch_size, args.min_quality)


if __name__ == "__main__":
    main()
