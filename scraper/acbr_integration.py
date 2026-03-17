"""
scraper/acbr_integration.py — Integração com a ACBr API para descoberta automática de leads.

A ACBr API permite buscar empresas por CNAE (classificação brasileira) e município,
retornando CNPJs ativos que podem ser consultados via BrasilAPI.

Uso:
    # Buscar todas as escolas de Brasília
    python -c "from acbr_integration import search_schools_by_municipality; \\
        schools = search_schools_by_municipality('8513900', '5300108'); \\
        print(f'Encontradas {len(schools)} escolas')"

    # Integrar no pipeline
    python scraper/orchestrator.py --acbr-discover DF --output descobertas.csv
"""

import logging
import time
from typing import List, Dict, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

LOG = logging.getLogger(__name__)

# CNAEs de interesse (escolas)
EDUCATION_CNAES = {
    "8511200": "Educação infantil — Creche",
    "8512100": "Educação infantil — Pré-escola",
    "8513900": "Ensino fundamental",
    "8520100": "Ensino médio",
    "8541400": "Ed. profissional nível técnico",
    "8531700": "Educação superior — Graduação",
    "8593700": "Ensino de idiomas",
    "8520200": "Ensino médio profissional",
}

# Mapa de estados → código IBGE de municípios (amostra)
MUNICIPALITY_CODES = {
    "DF": {
        "Brasília": "5300108",
    },
    "SP": {
        "São Paulo": "3550308",
        "Campinas": "3509007",
        "Sorocaba": "3552403",
    },
    "RJ": {
        "Rio de Janeiro": "3304557",
        "Niterói": "3303302",
    },
    "MG": {
        "Belo Horizonte": "3106200",
        "Uberlândia": "3170206",
    },
    "BA": {
        "Salvador": "2704302",
        "Feira de Santana": "2910800",
    },
    "CE": {
        "Fortaleza": "2304400",
        "Caucaia": "2302100",
    },
    "PE": {
        "Recife": "2611606",
        "Olinda": "2609600",
    },
    # ... adicionar mais conforme necessário
}


def _create_session(retries: int = 5) -> requests.Session:
    """
    Criar session com retry automático.

    Args:
        retries: Número de tentativas

    Returns:
        Sessão configurada
    """
    session = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=0.3,
        status_forcelist=(500, 502, 504),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


class ACBrClient:
    """Cliente para ACBr API."""

    BASE_URL = "https://api.acbrapi.com.br"

    def __init__(self, api_key: Optional[str] = None, timeout: int = 30):
        """
        Args:
            api_key: Chave da API ACBr (pode ser None para modo gratuito com rate limit)
            timeout: Timeout em segundos
        """
        self.api_key = api_key
        self.timeout = timeout
        self.session = _create_session()

    def _get_headers(self) -> Dict[str, str]:
        """Montar headers com autenticação."""
        headers = {
            "Accept": "application/json",
            "User-Agent": "Wayzen SchoolCrawler/1.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def search_enterprises_by_cnae_and_municipality(
        self,
        cnae: str,
        municipality_code: str,
        limit: int = 100,
    ) -> List[Dict]:
        """
        Buscar empresas por CNAE e município.

        Args:
            cnae: Código CNAE (ex: '8513900' para ensino fundamental)
            municipality_code: Código IBGE do município (ex: '5300108' para Brasília)
            limit: Máximo de resultados

        Returns:
            Lista de empresas com CNPJ, razão social, etc
        """
        LOG.info(f"Buscando CNAE {cnae} no município {municipality_code}...")

        url = f"{self.BASE_URL}/search"
        params = {
            "cnae": cnae,
            "municipalityCode": municipality_code,
            "limit": limit,
            "status": "active",  # Apenas ativas
        }

        try:
            response = self.session.get(
                url,
                params=params,
                headers=self._get_headers(),
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()

            enterprises = data.get("data", [])
            LOG.info(f"✅ Encontradas {len(enterprises)} empresas")
            return enterprises

        except requests.exceptions.RequestException as e:
            LOG.error(f"❌ Erro ao buscar ACBr: {e}")
            return []

    def get_enterprise_detail(self, cnpj: str) -> Optional[Dict]:
        """
        Obter detalhes de uma empresa pelo CNPJ.

        Args:
            cnpj: CNPJ da empresa

        Returns:
            Detalhes da empresa ou None se não encontrada
        """
        url = f"{self.BASE_URL}/cnpj/{cnpj}"

        try:
            response = self.session.get(
                url,
                headers=self._get_headers(),
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            LOG.warning(f"Erro ao buscar CNPJ {cnpj}: {e}")
            return None


def search_schools_by_municipality(cnae: str, municipality_code: str) -> List[Dict]:
    """
    Buscar escolas ativas em um município.

    Args:
        cnae: Código CNAE (ex: '8513900')
        municipality_code: Código IBGE (ex: '5300108')

    Returns:
        Lista de escolas (CNPJs)
    """
    client = ACBrClient()
    return client.search_enterprises_by_cnae_and_municipality(cnae, municipality_code)


def discover_schools_by_state(state: str) -> List[Dict]:
    """
    Descobrir escolas em todos os municípios de um estado (amostra).

    Args:
        state: UF (ex: 'DF')

    Returns:
        Lista de escolas encontradas
    """
    if state not in MUNICIPALITY_CODES:
        LOG.warning(f"Estado {state} não tem municípios mapeados.")
        return []

    schools = []
    client = ACBrClient()

    for municipality_name, municipality_code in MUNICIPALITY_CODES[state].items():
        LOG.info(f"Descobrindo escolas em {municipality_name}/{state}...")

        for cnae, cnae_desc in EDUCATION_CNAES.items():
            LOG.debug(f"  Buscando CNAE {cnae} ({cnae_desc})...")
            enterprises = client.search_enterprises_by_cnae_and_municipality(
                cnae,
                municipality_code,
                limit=50,
            )
            schools.extend(enterprises)
            time.sleep(0.5)  # Rate limiting

    LOG.info(f"✅ Total de escolas descobertas em {state}: {len(schools)}")
    return schools


def export_discoveries_to_csv(schools: List[Dict], output_path: str) -> None:
    """
    Exportar descobertas para CSV compatível com main.py.

    Args:
        schools: Lista de escolas do ACBr
        output_path: Caminho do arquivo CSV
    """
    import pandas as pd

    if not schools:
        LOG.warning("Nenhuma escola para exportar.")
        return

    # Extrair campos principais
    rows = []
    for school in schools:
        rows.append({
            "name": school.get("razaoSocial", ""),
            "cnpj": school.get("cnpj", ""),
            "address": school.get("endereco", ""),
            "city": school.get("municipio", ""),
            "state": school.get("uf", ""),
            "phone_number": school.get("telefone", ""),
            "website": school.get("website", ""),
            "email": school.get("email", ""),
            "source": "ACBr",
        })

    df = pd.DataFrame(rows)
    df.to_csv(output_path, index=False, encoding="utf-8-sig")
    LOG.info(f"✅ Exportado para {output_path}")


if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    parser = argparse.ArgumentParser(
        description="Descobrir escolas via ACBr API"
    )
    parser.add_argument(
        "--state",
        "-s",
        required=True,
        help="Estado (UF) para descobrir escolas (ex: DF)",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="acbr_discoveries.csv",
        help="Arquivo CSV de saída",
    )

    args = parser.parse_args()

    schools = discover_schools_by_state(args.state)
    export_discoveries_to_csv(schools, args.output)
    LOG.info(f"✅ Arquivo criado: {args.output}")
