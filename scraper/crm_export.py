"""
scraper/crm_export.py — Exportador de leads para CRMs (HubSpot, RD Station, Pipedrive).

Sincroniza dados de school_leads com CRMs via webhooks e APIs autenticadas.

Uso:
    python scraper/crm_export.py --crm hubspot --input scored.csv \\
        --api-key '<hs_private_xxx>'

    python scraper/crm_export.py --crm rd-station --input scored.csv \\
        --api-key '<api_key>' --organization-id '<org_id>'
"""

import logging
import json
import time
from typing import Optional, Dict, List
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum

import requests
import pandas as pd

LOG = logging.getLogger(__name__)


class CRMType(str, Enum):
    """Tipos de CRM suportados."""
    HUBSPOT = "hubspot"
    RD_STATION = "rd-station"
    PIPEDRIVE = "pipedrive"
    ZAPIER = "zapier"  # Webhook genérico


@dataclass
class LeadMapping:
    """Mapeamento de campos CSV → CRM."""
    crm_field: str
    csv_field: str
    transform: Optional[callable] = None


class CRMExporter(ABC):
    """Interface abstrata para exportadores CRM."""

    def __init__(self, api_key: str, timeout: int = 30):
        """
        Args:
            api_key: Chave de autenticação
            timeout: Timeout em segundos
        """
        self.api_key = api_key
        self.timeout = timeout
        self.session = self._create_session()

    def _create_session(self) -> requests.Session:
        """Criar session com headers padrão."""
        session = requests.Session()
        session.headers.update(self._get_headers())
        return session

    @abstractmethod
    def _get_headers(self) -> Dict[str, str]:
        """Retornar headers com autenticação."""
        pass

    @abstractmethod
    def _map_lead(self, row: pd.Series) -> Dict:
        """Mapear registro CSV para modelo CRM."""
        pass

    @abstractmethod
    def export_lead(self, lead: Dict) -> bool:
        """Exportar um lead. Retorna True se sucesso."""
        pass

    def export_csv(self, csv_path: str, skip_errors: bool = True) -> Dict:
        """
        Exportar CSV inteiro para CRM.

        Args:
            csv_path: Caminho do CSV
            skip_errors: Continuar se um lead falhar

        Returns:
            Dicionário com estatísticas
        """
        df = pd.read_csv(csv_path)
        LOG.info(f"Exportando {len(df)} leads para {self.__class__.__name__}...")

        stats = {"total": len(df), "success": 0, "failed": 0, "skipped": 0, "errors": []}

        for idx, row in df.iterrows():
            try:
                # Mapear lead
                lead = self._map_lead(row)

                # Pular se não houver campos obrigatórios
                if not lead.get("email") and not lead.get("phone"):
                    LOG.debug(f"Lead {idx}: sem email/phone, pulando")
                    stats["skipped"] += 1
                    continue

                # Exportar
                if self.export_lead(lead):
                    stats["success"] += 1
                    LOG.debug(f"✅ Lead {idx}: {lead.get('name', 'N/A')}")
                else:
                    stats["failed"] += 1
                    stats["errors"].append(f"Lead {idx}: falha na exportação")

            except Exception as e:
                stats["failed"] += 1
                error_msg = f"Lead {idx}: {str(e)}"
                stats["errors"].append(error_msg)
                LOG.error(error_msg)

                if not skip_errors:
                    raise

            time.sleep(0.1)  # Rate limiting

        LOG.info(f"📊 Exportação concluída:")
        LOG.info(f"   • Sucesso: {stats['success']}")
        LOG.info(f"   • Falhas: {stats['failed']}")
        LOG.info(f"   • Pulados: {stats['skipped']}")

        return stats


class HubSpotExporter(CRMExporter):
    """Exportador para HubSpot API."""

    BASE_URL = "https://api.hubapi.com"

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _map_lead(self, row: pd.Series) -> Dict:
        """Mapear para formato HubSpot."""
        # HubSpot usa 'firstname', 'lastname', 'email', 'phone', 'company', etc.
        return {
            "firstname": row.get("name", "").split()[0],
            "lastname": " ".join(row.get("name", "").split()[1:]) or "N/A",
            "email": row.get("email") or row.get("crawled_email") or None,
            "phone": row.get("phone_formatted") or row.get("crawled_phone") or None,
            "company": row.get("name", ""),
            "website": row.get("website") or row.get("website", ""),
            "city": row.get("city", ""),
            "state": row.get("state", ""),
            "zip": row.get("cep", ""),
            "address": row.get("address", ""),
            # Custom properties
            "school_segment": row.get("school_segment", ""),
            "ai_score": str(row.get("ai_score", "")),
            "icp_match": row.get("icp_match", ""),
            "source": "Wayzen",
        }

    def export_lead(self, lead: Dict) -> bool:
        """Exportar para HubSpot (via upsert by email)."""
        if not lead.get("email"):
            LOG.warning("Lead sem email, pulando HubSpot")
            return False

        url = f"{self.BASE_URL}/crm/v3/objects/contacts"

        # Preparar payload para criar ou atualizar
        payload = {
            "associations": [],
            "properties": {
                f.lower().replace(" ", "_"): str(v) for f, v in lead.items() if v is not None
            }
        }

        try:
            response = self.session.post(url, json=payload, timeout=self.timeout)
            if response.status_code in (200, 201):
                LOG.debug(f"✅ Lead criado/atualizado em HubSpot: {lead.get('email')}")
                return True
            else:
                LOG.warning(f"❌ HubSpot {response.status_code}: {response.text}")
                return False
        except Exception as e:
            LOG.error(f"❌ Erro ao exportar para HubSpot: {e}")
            return False


class RDStationExporter(CRMExporter):
    """Exportador para RD Station API."""

    BASE_URL = "https://api.rd.services/api/v1"

    def __init__(self, api_key: str, organization_id: str, **kwargs):
        """
        Args:
            api_key: API key da RD Station
            organization_id: Organization ID (para multi-tenant)
        """
        super().__init__(api_key, **kwargs)
        self.organization_id = organization_id

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _map_lead(self, row: pd.Series) -> Dict:
        """Mapear para formato RD Station."""
        return {
            "name": row.get("name", ""),
            "email": row.get("email") or row.get("crawled_email"),
            "phone": row.get("phone_formatted") or row.get("crawled_phone"),
            "company": row.get("name", ""),
            "website": row.get("website"),
            "city": row.get("city", ""),
            "state": row.get("state", ""),
            "cf_school_segment": row.get("school_segment", ""),
            "cf_ai_score": str(row.get("ai_score", "")),
            "cf_icp_match": row.get("icp_match", ""),
            "cf_source": "Wayzen",
        }

    def export_lead(self, lead: Dict) -> bool:
        """Exportar para RD Station."""
        if not lead.get("email"):
            LOG.warning("Lead sem email, pulando RD Station")
            return False

        url = f"{self.BASE_URL}/contacts"
        params = {"organization_id": self.organization_id}

        payload = {
            "email": lead["email"],
            "name": lead.get("name", ""),
            "phone": lead.get("phone"),
            "legal_form": "pj",  # Assumes escolas são PJ
            "company": lead.get("company", ""),
            "website": lead.get("website", ""),
            "city": lead.get("city", ""),
            "state": lead.get("state", ""),
            "custom_fields": {
                "school_segment": lead.get("cf_school_segment", ""),
                "ai_score": lead.get("cf_ai_score", ""),
                "icp_match": lead.get("cf_icp_match", ""),
                "source": lead.get("cf_source", ""),
            }
        }

        try:
            response = self.session.post(
                url,
                json=payload,
                params=params,
                timeout=self.timeout,
            )
            if response.status_code in (200, 201):
                LOG.debug(f"✅ Lead criado em RD Station: {lead.get('email')}")
                return True
            else:
                LOG.warning(f"❌ RD Station {response.status_code}: {response.text}")
                return False
        except Exception as e:
            LOG.error(f"❌ Erro ao exportar para RD Station: {e}")
            return False


class ZapierWebhookExporter(CRMExporter):
    """Exportador genérico via webhook Zapier."""

    def __init__(self, webhook_url: str, **kwargs):
        """
        Args:
            webhook_url: URL do webhook Zapier (ou qualquer webhook genérico)
        """
        self.webhook_url = webhook_url
        kwargs.pop("api_key", None)  # Não usa api_key
        super().__init__(api_key="", **kwargs)

    def _get_headers(self) -> Dict[str, str]:
        return {"Content-Type": "application/json"}

    def _map_lead(self, row: pd.Series) -> Dict:
        """Mapear para formato genérico."""
        return {
            "name": row.get("name", ""),
            "email": row.get("email") or row.get("crawled_email"),
            "phone": row.get("phone_formatted") or row.get("crawled_phone"),
            "company": row.get("name", ""),
            "website": row.get("website"),
            "city": row.get("city", ""),
            "state": row.get("state", ""),
            "school_segment": row.get("school_segment", ""),
            "ai_score": row.get("ai_score"),
            "icp_match": row.get("icp_match", ""),
            "source": "Wayzen",
        }

    def export_lead(self, lead: Dict) -> bool:
        """Exportar via webhook."""
        try:
            response = requests.post(
                self.webhook_url,
                json=lead,
                timeout=self.timeout,
            )
            if response.status_code in (200, 201):
                LOG.debug(f"✅ Lead enviado para webhook: {lead.get('email')}")
                return True
            else:
                LOG.warning(f"❌ Webhook {response.status_code}: {response.text}")
                return False
        except Exception as e:
            LOG.error(f"❌ Erro ao enviar para webhook: {e}")
            return False


def get_exporter(crm_type: CRMType, **kwargs) -> CRMExporter:
    """Factory para obter exportador correto."""
    if crm_type == CRMType.HUBSPOT:
        return HubSpotExporter(kwargs["api_key"])
    elif crm_type == CRMType.RD_STATION:
        return RDStationExporter(
            api_key=kwargs["api_key"],
            organization_id=kwargs.get("organization_id", ""),
        )
    elif crm_type == CRMType.ZAPIER:
        return ZapierWebhookExporter(webhook_url=kwargs["webhook_url"])
    else:
        raise ValueError(f"CRM não suportado: {crm_type}")


if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )

    parser = argparse.ArgumentParser(
        description="Exportar leads para CRMs"
    )
    parser.add_argument(
        "--crm",
        required=True,
        choices=list(CRMType),
        help="Tipo de CRM"
    )
    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Arquivo CSV de entrada"
    )
    parser.add_argument(
        "--api-key",
        help="API key do CRM"
    )
    parser.add_argument(
        "--organization-id",
        help="Organization ID (RD Station)"
    )
    parser.add_argument(
        "--webhook-url",
        help="URL do webhook (Zapier)"
    )

    args = parser.parse_args()

    try:
        exporter = get_exporter(
            CRMType(args.crm),
            api_key=args.api_key,
            organization_id=args.organization_id,
            webhook_url=args.webhook_url,
        )
        stats = exporter.export_csv(args.input)
        LOG.info(f"✅ Exportação concluída!")

    except Exception as e:
        LOG.error(f"Erro: {e}")
        exit(1)
