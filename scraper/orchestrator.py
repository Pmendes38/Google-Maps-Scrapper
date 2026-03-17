"""
scraper/orchestrator.py — Orquestrador completo de pipeline nacional.

Coordena: scrape → enrich → crawl → score → supabase upload

Uso:
    python scraper/orchestrator.py --enrich-only -i brasilia.csv -o enriched.csv

    python scraper/orchestrator.py --score-only -i enriched.csv -o scored.csv

    python scraper/orchestrator.py --crawl-only -i enriched.csv -o crawled.csv
"""

import sys
import logging
import argparse
import subprocess
from pathlib import Path
from typing import Optional, List
import os
from dotenv import load_dotenv

LOG = logging.getLogger(__name__)


class Pipeline:
    """Pipeline orchestrator para processamento nacional."""

    PHASES = ['scrape', 'enrich', 'crawl', 'score', 'upload']
    SCRIPTS = {
        'enrich': 'scraper/main.py --enrich-only',
        'crawl': 'scraper/crawler.py',
        'score': 'scraper/scorer.py',
    }

    def __init__(self, output_dir: str = '.', workers: int = 5, timeout: int = 10):
        """
        Args:
            output_dir: Diretório para salvar CSVs intermediários
            workers: Número de workers paralelos
            timeout: Timeout para crawl em segundos
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.workers = workers
        self.timeout = timeout

    def _get_filepath(self, name: str) -> Path:
        """Obter caminho para arquivo intermediário."""
        return self.output_dir / name

    def phase_enrich(self, input_path: Path, skip_geo: bool = False) -> Path:
        """
        Fase 2: Enriquecimento (BrasilAPI, CEP, CNPJ).

        Args:
            input_path: CSV de entrada (com leads não enriquecidos)
            skip_geo: Não buscar coordenadas via CEP

        Returns:
            Caminho do CSV enriquecido
        """
        LOG.info("=" * 80)
        LOG.info("▶️  FASE 2: ENRIQUECIMENTO (BrasilAPI, CEP, CNPJ)")
        LOG.info("=" * 80)

        output_path = self._get_filepath('02_enriched.csv')

        if not input_path.exists():
            raise FileNotFoundError(f"Arquivo de entrada não encontrado: {input_path}")

        LOG.info(f"Enriquecendo {input_path} (skip_geo={skip_geo})...")
        
        # Use o mesmo interpretador atual e módulo Python para manter imports estáveis
        cmd = [sys.executable, '-m', 'scraper.main', '--enrich-only', '-i', str(input_path), '-o', str(output_path)]
        if skip_geo:
            cmd.append('--skip-geo')
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            LOG.error(f"Enriquecimento falhou: {result.stderr}")
            raise RuntimeError("Erro no enriquecimento")

        LOG.info(f"✅ Enriquecimento concluído: {output_path}")
        return output_path

    def phase_crawl(self, input_path: Path, url_column: str = 'website') -> Path:
        """
        Fase 3: Web Crawling (emails, mensalidades, social media).

        Args:
            input_path: CSV de entrada (com website URLs)
            url_column: Nome da coluna com URLs

        Returns:
            Caminho do CSV com dados extraídos
        """
        LOG.info("=" * 80)
        LOG.info("▶️  FASE 3: WEB CRAWLING (Emails, Mensalidades, Social Media)")
        LOG.info("=" * 80)

        output_path = self._get_filepath('03_crawled.csv')

        if not input_path.exists():
            raise FileNotFoundError(f"Arquivo de entrada não encontrado: {input_path}")

        LOG.info(f"Crawlando {input_path} com {self.workers} workers, timeout={self.timeout}s...")
        
        cmd = [
            sys.executable, '-m', 'scraper.crawler',
            '-i', str(input_path),
            '-o', str(output_path),
            '--timeout', str(self.timeout),
            '--workers', str(self.workers),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            LOG.error(f"Crawl falhou: {result.stderr}")
            raise RuntimeError("Erro no crawl")

        LOG.info(f"✅ Crawling concluído: {output_path}")
        return output_path

    def phase_score(self, input_path: Path, batch_size: int = 40, min_quality: int = 0) -> Path:
        """
        Fase 4: Scoring via Claude API.

        Args:
            input_path: CSV de entrada (com dados enriquecidos)
            batch_size: Tamanho do batch para Claude API
            min_quality: Filtro mínimo de data_quality (%)

        Returns:
            Caminho do CSV com scores
        """
        LOG.info("=" * 80)
        LOG.info("▶️  FASE 4: SCORING (Claude API)")
        LOG.info("=" * 80)

        output_path = self._get_filepath('04_scored.csv')

        if not input_path.exists():
            raise FileNotFoundError(f"Arquivo de entrada não encontrado: {input_path}")

        LOG.info(f"Scoring {input_path}...")
        
        cmd = [
            sys.executable, '-m', 'scraper.scorer',
            '-i', str(input_path),
            '-o', str(output_path),
            '--batch-size', str(batch_size),
        ]
        if min_quality > 0:
            cmd.extend(['--min-quality', str(min_quality)])
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            LOG.error(f"Scoring falhou: {result.stderr}")
            raise RuntimeError("Erro no scoring")

        LOG.info(f"✅ Scoring concluído: {output_path}")
        return output_path

    def phase_upload(self, input_path: Path) -> None:
        """
        Fase 5: Upload para Supabase.

        Args:
            input_path: CSV com dados finais (scored + crawled)
        """
        LOG.info("=" * 80)
        LOG.info("▶️  FASE 5: UPLOAD SUPABASE")
        LOG.info("=" * 80)

        if not input_path.exists():
            raise FileNotFoundError(f"Arquivo de entrada não encontrado: {input_path}")

        LOG.warning("⚠️  Upload manual: Importar CSV via Supabase Dashboard ou CLI:")
        LOG.warning(f"    supabase db push {input_path}")
        LOG.warning(f"    Ou usar API: curl -X POST https://api.supabase.co/rest/v1/school_leads \\")
        LOG.warning(f"        -H 'apikey: <SUPABASE_KEY>' -H 'Content-Type: text/csv' \\")
        LOG.warning(f"        --data-binary @{input_path}")

        LOG.info(f"✅ Arquivo pronto para upload: {input_path}")

    def run(
        self,
        phases: List[str],
        input_path: Optional[str] = None,
        output_path: Optional[str] = None,
        batch_size: int = 40,
        min_quality: int = 0,
        skip_geo: bool = False,
    ) -> Path:
        """
        Executar pipeline com fases especificadas.

        Args:
            phases: Lista de fases a executar ['enrich', 'crawl', 'score', 'upload']
            input_path: Caminho de entrada
            output_path: Caminho de saída final
            batch_size: Tamanho de batch para scorer
            min_quality: Filtro de qualidade
            skip_geo: Pular enriquecimento de geo

        Returns:
            Caminho do arquivo final
        """
        LOG.info("🚀 WAYZEN PIPELINE - Fase 3 Orchestrator")
        LOG.info(f"Fases: {' → '.join(phases)}")
        LOG.info(f"Diretório: {self.output_dir}")

        current_path = None if input_path is None else Path(input_path)

        try:
            for phase in phases:
                if phase not in self.PHASES:
                    raise ValueError(f"Fase desconhecida: {phase}")

                if phase == 'enrich':
                    if not current_path:
                        raise ValueError("Forneça arquivo de entrada para fase enrich")
                    current_path = self.phase_enrich(current_path, skip_geo=skip_geo)

                elif phase == 'crawl':
                    if not current_path:
                        raise ValueError("Forneça arquivo de entrada para fase crawl")
                    current_path = self.phase_crawl(current_path)

                elif phase == 'score':
                    if not current_path:
                        raise ValueError("Forneça arquivo de entrada para fase score")
                    current_path = self.phase_score(current_path, batch_size=batch_size, min_quality=min_quality)

                elif phase == 'upload':
                    if not current_path:
                        raise ValueError("Forneça arquivo de entrada para fase upload")
                    self.phase_upload(current_path)

        except Exception as e:
            LOG.error(f"❌ Pipeline falhou na fase: {e}")
            raise

        # Copiar arquivo final para output se especificado
        if output_path and current_path and str(current_path) != output_path:
            import shutil
            shutil.copy(current_path, output_path)
            LOG.info(f"✅ Arquivo final copiado: {output_path}")
            current_path = Path(output_path)

        LOG.info("=" * 80)
        LOG.info("✅ PIPELINE CONCLUÍDO COM SUCESSO!")
        LOG.info(f"Saída: {current_path}")
        LOG.info("=" * 80)

        return current_path


def main():
    """CLI para pipeline orchestrator."""
    load_dotenv()

    parser = argparse.ArgumentParser(
        description='Orquestrador de pipeline Wayzen (Fase 3)'
    )

    # Global options
    parser.add_argument('--output', '-o', help='Arquivo de saida final')
    parser.add_argument('--workers', type=int, default=5, help='Workers paralelos (default: 5)')
    parser.add_argument('--timeout', type=int, default=10, help='Timeout por pagina em segundos (default: 10)')
    
    # Input options
    parser.add_argument('-i', '--input', help='Arquivo de entrada')

    # Enrich options
    parser.add_argument('--skip-geo', action='store_true', help='Nao buscar coordenadas via CEP')

    # Score options
    parser.add_argument('--batch-size', type=int, default=40, help='Batch size para Claude API (default: 40)')
    parser.add_argument('--min-quality', type=int, default=0, help='Filtro data_quality minima %% (default: 0)')

    # Shortcut options
    parser.add_argument('--enrich-only', action='store_true', help='Apenas enriquecimento (requer -i)')
    parser.add_argument('--score-only', action='store_true', help='Apenas scoring (requer -i)')
    parser.add_argument('--crawl-only', action='store_true', help='Apenas crawl (requer -i)')

    args = parser.parse_args()

    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )

    # Resolver fases
    if args.enrich_only:
        phases = ['enrich']
    elif args.score_only:
        phases = ['score']
    elif args.crawl_only:
        phases = ['crawl']
    else:
        LOG.error("Use --enrich-only, --score-only ou --crawl-only")
        sys.exit(1)

    # Validar
    if not args.input:
        LOG.error("Forneca arquivo de entrada: -i/--input")
        sys.exit(1)

    # Executar
    pipeline = Pipeline(output_dir='.', workers=args.workers, timeout=args.timeout)
    try:
        pipeline.run(
            phases=phases,
            input_path=args.input,
            output_path=args.output,
            batch_size=args.batch_size,
            min_quality=args.min_quality,
            skip_geo=args.skip_geo,
        )
    except Exception as e:
        LOG.error(f"Erro na execucao do pipeline: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
