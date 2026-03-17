"""
scraper/monitor_cnpj.py — Monitor automático de CNPJs escolares novos.

Roda via cron (systemd timer, celery) para periodicamente:
1. Buscar CNPJs novos por CNAE educacional
2. Verificar quais ainda não estão na base
3. Adicionar para enriquecimento/scoring

Uso:
    # Executar uma vez
    python scraper/monitor_cnpj.py --check-interval 1

    # Via cron: a cada 6 horas
    0 */6 * * * /usr/bin/python3 /app/scraper/monitor_cnpj.py

    # Via systemd timer: criar /etc/systemd/system/wayzen-monitor.timer
    [Unit]
    Description=Wayzen CNPJ Monitor
    After=network-online.target

    [Timer]
    OnBootSec=5min
    OnUnitActiveSec=6h
    Persistent=true

    [Install]
    WantedBy=timers.target
"""

import logging
import time
import os
from typing import List, Set, Optional
from datetime import datetime
from pathlib import Path
import sqlite3
import csv

import pandas as pd
from dotenv import load_dotenv

LOG = logging.getLogger(__name__)

# CNAEs de interesse
EDUCATION_CNAES = [
    "8511200",  # Creche
    "8512100",  # Pré-escola
    "8513900",  # Fundamental
    "8520100",  # Médio
    "8541400",  # Técnico
    "8531700",  # Superior
    "8593700",  # Idiomas
    "8520200",  # Médio profissional
]


class CNPJMonitor:
    """Monitor automático de CNPJs - detecta schools novas."""

    def __init__(self, db_path: str = "wayzen_cnpj_monitor.db", cache_dir: str = ".wayzen_cache"):
        """
        Args:
            db_path: Caminho do banco SQLite para rastrear CNPJs monitorados
            cache_dir: Diretório para cache de APIs
        """
        self.db_path = db_path
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        
        # Inicializar DB
        self._init_db()

    def _init_db(self):
        """Criar tabelas de rastreamento."""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        # Tabela de CNPJs visto (para não reprocessar)
        c.execute('''
            CREATE TABLE IF NOT EXISTS seen_cnpjs (
                cnpj TEXT PRIMARY KEY,
                first_found_at TIMESTAMP,
                last_checked_at TIMESTAMP,
                status TEXT,
                cnae TEXT
            )
        ''')
        
        # Tabela de monitoramento
        c.execute('''
            CREATE TABLE IF NOT EXISTS monitor_runs (
                run_id TEXT PRIMARY KEY,
                run_at TIMESTAMP,
                cnpaes_checked TEXT,
                new_cnpjs_found INT,
                errors TEXT
            )
        ''')
        
        conn.commit()
        conn.close()

    def _get_seen_cnpjs(self) -> Set[str]:
        """Obter set de CNPJs já vistos."""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute("SELECT cnpj FROM seen_cnpjs")
        rows = c.fetchall()
        conn.close()
        return {row[0] for row in rows}

    def _track_cnpj(self, cnpj: str, cnae: str, status: str = "new"):
        """Registrar CNPJ no tracker."""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''
            INSERT OR REPLACE INTO seen_cnpjs 
            (cnpj, first_found_at, last_checked_at, status, cnae)
            VALUES (?, ?, ?, ?, ?)
        ''', (cnpj, datetime.now(), datetime.now(), status, cnae))
        conn.commit()
        conn.close()

    def _record_run(self, run_id: str, cnpaes: List[str], new_count: int, errors: str = ""):
        """Registrar execução do monitor."""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''
            INSERT INTO monitor_runs 
            (run_id, run_at, cnpaes_checked, new_cnpjs_found, errors)
            VALUES (?, ?, ?, ?, ?)
        ''', (run_id, datetime.now(), ",".join(cnpaes), new_count, errors))
        conn.commit()
        conn.close()

    def check_new_schools(self) -> dict:
        """
        Executar verificação de novos CNPJs.

        Returns:
            Dict com estatísticas da verificação
        """
        LOG.info("🔍 Iniciando monitor de CNPJs escolares...")
        
        run_id = f"run_{int(time.time())}"
        seen = self._get_seen_cnpjs()
        stats = {"new": [], "already_tracked": [], "errors": []}

        # ⚠️ Nota: Implementação simplificada
        # Em produção, integrar com ACBr API ou OpenCNPJ para descoberta real
        LOG.info(f"Monitorando {len(EDUCATION_CNAES)} CNAEs educacionais...")
        LOG.info(f"Already tracking: {len(seen)} CNPJs")

        # Placeholder: simulando descoberta
        # Em produção, seríamos como:
        # from acbr_integration import ACBrClient
        # client = ACBrClient(api_key=os.getenv('ACBR_API_KEY'))
        # for cnae in EDUCATION_CNAES:
        #     enterprises = client.search_enterprises_by_cnae(cnae, page=1)
        #     for ent in enterprises:
        #         if ent['cnpj'] not in seen:
        #             stats['new'].append({...})

        LOG.warning("⚠️  Implementação de descoberta real requer ACBr API key")
        LOG.info("Para ativar: ACBR_API_KEY=xxx python scraper/monitor_cnpj.py")

        self._record_run(run_id, EDUCATION_CNAES, len(stats["new"]))

        return stats

    def export_new_cnpjs_to_csv(self, output_path: str = "new_schools.csv") -> int:
        """
        Exportar novos CNPJs descobertos para CSV (pronto para pipeline).

        Args:
            output_path: Arquivo de saída

        Returns:
            Número de CNPJs exportados
        """
        conn = sqlite3.connect(self.db_path)
        query = "SELECT cnpj, cnae, first_found_at FROM seen_cnpjs WHERE status='new' LIMIT 1000"
        df = pd.read_sql_query(query, conn)
        conn.close()

        if df.empty:
            LOG.info("Nenhum novo CNPJ para exportar.")
            return 0

        # Converter para formato compatível com pipeline
        df.columns = ["cnpj", "cnae", "discovered_at"]
        df["source"] = "Monitor CNPJ"
        
        df.to_csv(output_path, index=False, encoding="utf-8-sig")
        LOG.info(f"✅ Exportados {len(df)} CNPJs para {output_path}")

        return len(df)

    def queue_for_enrichment(self, output_path: str = "queue_enrichment.csv") -> None:
        """
        Fila novos CNPJs para enriquecimento automático.

        Criará um CSV que pode ser passado para scraper/orchestrator.py
        """
        conn = sqlite3.connect(self.db_path)
        query = "SELECT DISTINCT cnpj FROM seen_cnpjs WHERE status='new' ORDER BY first_found_at DESC LIMIT 500"
        df = pd.read_sql_query(query, conn)
        conn.close()

        if df.empty:
            LOG.info("Nenhum CNPJ para fila.")
            return

        # Minimal format for enrichment pipeline
        df["source"] = "CNPJ Monitor"
        df["enrichment_status"] = "pending"
        df.to_csv(output_path, index=False, encoding="utf-8-sig")

        LOG.info(f"✅ {len(df)} CNPJs enfileirados em {output_path}")
        LOG.info(f"Próximo passo: python scraper/orchestrator.py --enrich-only -i {output_path} -o enriched.csv")


def run_monitor(check_interval: int = 1, continuous: bool = False):
    """
    Executar monitor (pode rodar uma vez ou continuamente).

    Args:
        check_interval: Intervalo entre checks em horas (use 1 para teste)
        continuous: Rodar continuamente vs. uma vez
    """
    monitor = CNPJMonitor()

    if not continuous:
        # Uma execução
        stats = monitor.check_new_schools()
        LOG.info(f"📊 Status: {len(stats['new'])} novos, {len(stats['already_tracked'])} já tracked")
        
        if stats['new']:
            monitor.export_new_cnpjs_to_csv()
            monitor.queue_for_enrichment()
    else:
        # Loop contínuo (para systemd/docker)
        interval_seconds = check_interval * 3600
        LOG.info(f"Modo contínuo: check a cada {check_interval}h ({interval_seconds}s)")
        
        while True:
            try:
                stats = monitor.check_new_schools()
                if stats['new']:
                    LOG.warning(f"🆕 Encontrados {len(stats['new'])} CNPJs novos!")
                    monitor.queue_for_enrichment()
                
                LOG.info(f"✅ Check completado, próximo em {check_interval}h")
                time.sleep(interval_seconds)
                
            except KeyboardInterrupt:
                LOG.info("Monitor parado pelo usuário")
                break
            except Exception as e:
                LOG.error(f"❌ Erro no monitor: {e}")
                time.sleep(60)  # Retry em 1 min


if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )

    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Monitor automático de CNPJs escolares"
    )
    parser.add_argument(
        "--check-interval",
        type=int,
        default=6,
        help="Intervalo entre verificações em horas (default: 6)"
    )
    parser.add_argument(
        "--continuous",
        action="store_true",
        help="Rodar continuamente (para systemd)"
    )
    parser.add_argument(
        "--export-new",
        action="store_true",
        help="Apenas exportar CNPJs novos e sair"
    )

    args = parser.parse_args()

    if args.export_new:
        monitor = CNPJMonitor()
        monitor.queue_for_enrichment()
    else:
        run_monitor(check_interval=args.check_interval, continuous=args.continuous)
