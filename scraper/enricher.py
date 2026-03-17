import json
import logging
import time
from typing import Any, Optional

import requests

from scraper.validators import clean_digits


BRASILAPI = "https://brasilapi.com.br/api"
VIACEP = "https://viacep.com.br/ws"
OPENCNPJ = "https://api.opencnpj.org"


class BrasilAPIEnricher:
    """Enriquecedor resiliente para dados públicos brasileiros."""

    def __init__(self, delay: float = 0.3, max_retries: int = 3):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "Wayzen-School-Intelligence/2.0"
        self.delay = delay
        self.max_retries = max_retries
        self._cep_cache: dict[str, dict[str, str]] = {}
        self._cnpj_cache: dict[str, dict[str, str]] = {}

    def enrich_cep(self, cep: str) -> dict[str, str]:
        """Enriquece CEP com logradouro, bairro, cidade, UF e coordenadas."""
        cep_clean = clean_digits(cep)
        if len(cep_clean) != 8:
            return {}
        if cep_clean in self._cep_cache:
            return self._cep_cache[cep_clean]

        brasilapi_data = self._get_with_retry(f"{BRASILAPI}/cep/v2/{cep_clean}")
        via_cep_data: Optional[dict[str, Any]] = None
        if not brasilapi_data:
            via_cep_data = self._get_with_retry(f"{VIACEP}/{cep_clean}/json/")

        source = brasilapi_data or via_cep_data or {}
        result = {
            "cep_logradouro": str(source.get("street") or source.get("logradouro") or ""),
            "cep_bairro": str(source.get("neighborhood") or source.get("bairro") or ""),
            "cep_cidade": str(source.get("city") or source.get("localidade") or ""),
            "cep_uf": str(source.get("state") or source.get("uf") or ""),
            "cep_lat": "",
            "cep_lng": "",
        }
        location = (brasilapi_data or {}).get("location") or {}
        coordinates = location.get("coordinates") or {}
        result["cep_lat"] = str(coordinates.get("latitude") or "")
        result["cep_lng"] = str(coordinates.get("longitude") or "")
        self._cep_cache[cep_clean] = result
        return result

    def enrich_cnpj(self, cnpj: str) -> dict[str, str]:
        """Enriquece CNPJ com situação cadastral, porte, capital e sócios."""
        cnpj_clean = clean_digits(cnpj)
        if len(cnpj_clean) != 14:
            return {}
        if cnpj_clean in self._cnpj_cache:
            return self._cnpj_cache[cnpj_clean]

        brasilapi_data = self._get_with_retry(f"{BRASILAPI}/cnpj/v1/{cnpj_clean}")
        open_cnpj_data = None if brasilapi_data else self._get_with_retry(f"{OPENCNPJ}/{cnpj_clean}")
        source = brasilapi_data or open_cnpj_data or {}

        qsa = source.get("qsa") or source.get("socios") or []
        socios = []
        for partner in qsa:
            socios.append(
                {
                    "nome": partner.get("nome_socio") or partner.get("nome") or "",
                    "qualificacao": partner.get("qualificacao_socio") or partner.get("qualificacao") or "",
                }
            )

        result = {
            "cnpj": cnpj_clean,
            "razao_social": str(source.get("razao_social") or source.get("nome") or ""),
            "situacao_cadastral": str(source.get("descricao_situacao_cadastral") or source.get("situacao") or ""),
            "data_abertura": str(source.get("data_inicio_atividade") or source.get("abertura") or ""),
            "capital_social": str(source.get("capital_social") or ""),
            "porte": str(source.get("descricao_porte") or source.get("porte") or ""),
            "cnae_principal": str(source.get("cnae_fiscal") or source.get("atividade_principal", [{}])[0].get("code") or ""),
            "cnae_descricao": str(source.get("cnae_fiscal_descricao") or source.get("atividade_principal", [{}])[0].get("text") or ""),
            "socios": json.dumps(socios, ensure_ascii=False),
        }
        self._cnpj_cache[cnpj_clean] = result
        return result

    def _get_with_retry(self, url: str) -> Optional[dict[str, Any]]:
        """Executa GET com backoff exponencial simples."""
        for attempt in range(self.max_retries):
            try:
                response = self.session.get(url, timeout=10)
                if response.status_code == 200:
                    time.sleep(self.delay)
                    return response.json()
                if response.status_code == 429:
                    time.sleep(2 ** attempt)
                    continue
            except Exception as exc:
                logging.debug("Falha ao consultar %s na tentativa %s: %s", url, attempt + 1, exc)
                time.sleep(2 ** attempt)
        return None
