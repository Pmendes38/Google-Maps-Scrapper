"""
scraper/crawler.py — Web crawler para extrair emails e mensalidades de sites de escolas.

Usa Playwright para browsing dinâmico e BeautifulSoup para parsing.

Uso:
    python scraper/crawler.py -i enriched.csv -o crawled.csv --timeout 10 --workers 5
"""

import asyncio
import logging
import argparse
import re
import time
from typing import Optional, Dict, List
from dataclasses import dataclass
from urllib.parse import urlparse

import pandas as pd
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from bs4 import BeautifulSoup

LOG = logging.getLogger(__name__)


@dataclass
class CrawlResult:
    """Resultado da extração de dados de um site."""
    website: str
    email: Optional[str] = None
    phone: Optional[str] = None
    tuition: Optional[str] = None
    tuition_value: Optional[float] = None
    social_media: Dict[str, str] = None
    curriculum: Optional[str] = None
    accreditation: Optional[str] = None
    success: bool = False
    error: Optional[str] = None
    response_time_ms: float = 0.0

    def __post_init__(self):
        if self.social_media is None:
            self.social_media = {}


class SchoolCrawler:
    """Web crawler para sites de escolas brasileiras."""

    # Padrões regex para detecção
    EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
    PHONE_PATTERN = re.compile(r'(?:\+55\s?)?(?:\(?[0-9]{2}\)?)\s?9?[0-9]{4,5}-?[0-9]{4}')
    TUITION_PATTERN = re.compile(
        r'(?:mensalidade|tuition|valor|preço|matrícula)(?:\s+|:|=|\$)\s*(?:R\$\s*)?([0-9.]+(?:,[0-9]{2})?)',
        re.IGNORECASE
    )
    INSTAGRAM_PATTERN = re.compile(r'(?:instagram\.com/|@)([a-zA-Z0-9._-]+)')
    FACEBOOK_PATTERN = re.compile(r'facebook\.com/([a-zA-Z0-9._-]+)')
    LINKEDIN_PATTERN = re.compile(r'linkedin\.com/company/([a-zA-Z0-9-]+)')

    # Seletores de emails comuns
    EMAIL_SELECTORS = [
        'a[href^="mailto:"]',
        '[data-email]',
        '[id*="email"]',
        '[class*="email"]',
    ]

    # Seletores de telefone comuns
    PHONE_SELECTORS = [
        'a[href^="tel:"]',
        '[data-phone]',
        '[id*="phone"]',
        '[class*="phone"]',
    ]

    def __init__(self, timeout: int = 10, headless: bool = True, user_agent: Optional[str] = None):
        """
        Args:
            timeout: Timeout por página em segundos
            headless: Rodar sem interface
            user_agent: User-Agent customizado
        """
        self.timeout = timeout * 1000  # ms
        self.headless = headless
        self.user_agent = user_agent or (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None

    async def init(self):
        """Inicializar browser Playwright."""
        LOG.info("Inicializando Playwright...")
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=['--disable-blink-features=AutomationControlled'],
        )
        self.context = await self.browser.new_context(
            user_agent=self.user_agent,
            viewport={'width': 1920, 'height': 1080},
        )

    async def cleanup(self):
        """Fechar browser."""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if hasattr(self, 'playwright'):
            await self.playwright.stop()

    async def crawl(self, website: str) -> CrawlResult:
        """
        Extrair dados de um site de escola.

        Args:
            website: URL do site (com ou sem https://)

        Returns:
            CrawlResult com os dados extraídos
        """
        # Normalizar URL
        if not website:
            return CrawlResult(website=website, error="URL vazia")

        url = website.strip()
        if not url.startswith('http'):
            url = f'https://{url}'

        result = CrawlResult(website=website)
        page: Optional[Page] = None
        start_time = time.time()

        try:
            page = await self.context.new_page()
            page.set_default_timeout(self.timeout)

            LOG.info(f"🔗 Acessando: {url}")
            response = await page.goto(url, wait_until='networkidle', timeout=self.timeout)

            if not response or response.status >= 400:
                raise Exception(f"HTTP {response.status if response else 'unknown'}")

            # Aguardar um pouco para JS carregar
            await asyncio.sleep(0.5)

            # Extrair conteúdo HTML
            html = await page.content()
            soup = BeautifulSoup(html, 'html.parser')
            text = soup.get_text(separator=' ', strip=True)

            # Extrair dados
            result.email = self._extract_email(soup, text)
            result.phone = self._extract_phone(soup, text)
            result.tuition = self._extract_tuition(text)
            result.tuition_value = self._parse_tuition_value(result.tuition)
            result.social_media = self._extract_social_media(html)
            result.curriculum = self._extract_curriculum(text)
            result.accreditation = self._extract_accreditation(text)
            result.success = True

            result.response_time_ms = (time.time() - start_time) * 1000
            LOG.info(f"✅ {website}: email={result.email}, phone={result.phone}, tuition={result.tuition}")

        except asyncio.TimeoutError:
            result.error = "Timeout"
            LOG.warning(f"⏱️  Timeout ao acessar {website}")
        except Exception as e:
            result.error = str(e)
            LOG.error(f"❌ Erro ao acessar {website}: {e}")
        finally:
            if page:
                await page.close()
            result.response_time_ms = (time.time() - start_time) * 1000

        return result

    def _extract_email(self, soup: BeautifulSoup, text: str) -> Optional[str]:
        """Extrair email usando seletores e regex."""
        # 1. Tentar seletores específicos
        for selector in self.EMAIL_SELECTORS:
            el = soup.select_one(selector)
            if el:
                # De atributo href="mailto:xxx"
                href = el.get('href', '')
                if href.startswith('mailto:'):
                    email = href.replace('mailto:', '').split('?')[0]
                    if self.EMAIL_PATTERN.match(email):
                        return email
                # De atributo data-email
                email = el.get('data-email', '')
                if email and self.EMAIL_PATTERN.match(email):
                    return email

        # 2. Buscar em footer/contato
        footer = soup.find(['footer', 'section'], {'id': re.compile('contato|contact', re.I)})
        if footer:
            emails = self.EMAIL_PATTERN.findall(footer.get_text())
            if emails:
                return emails[0]

        # 3. Buscar em todo o texto
        emails = self.EMAIL_PATTERN.findall(text)
        # Filtrar falsos positivos
        emails = [e for e in emails if not any(x in e.lower() for x in ['example', 'test', 'demo'])]
        return emails[0] if emails else None

    def _extract_phone(self, soup: BeautifulSoup, text: str) -> Optional[str]:
        """Extrair telefone usando seletores e regex."""
        # 1. Tentar seletores específicos
        for selector in self.PHONE_SELECTORS:
            el = soup.select_one(selector)
            if el:
                href = el.get('href', '')
                if href.startswith('tel:'):
                    phone = href.replace('tel:', '')
                    if self.PHONE_PATTERN.match(phone):
                        return phone
                data_phone = el.get('data-phone', '')
                if data_phone and self.PHONE_PATTERN.match(data_phone):
                    return data_phone

        # 2. Buscar em texto
        phones = self.PHONE_PATTERN.findall(text)
        return phones[0] if phones else None

    def _extract_tuition(self, text: str) -> Optional[str]:
        """Extrair mensalidade usando regex."""
        matches = self.TUITION_PATTERN.findall(text)
        if matches:
            # Pegar o primeiro match que pareça válido
            for match in matches:
                if match and len(match) > 2:  # Descartar muito curtos
                    return match
        return None

    def _parse_tuition_value(self, tuition_str: Optional[str]) -> Optional[float]:
        """Converter string de mensalidade para float."""
        if not tuition_str:
            return None
        try:
            # Remover R$ e espaços
            cleaned = tuition_str.replace('R$', '').strip()
            # Converter ponto como milhares, vírgula como decimal
            if ',' in cleaned:
                cleaned = cleaned.replace('.', '').replace(',', '.')
            return float(cleaned)
        except ValueError:
            return None

    def _extract_social_media(self, html: str) -> Dict[str, str]:
        """Extrair links de redes sociais."""
        result = {}

        # Instagram
        ig_matches = self.INSTAGRAM_PATTERN.findall(html)
        if ig_matches:
            result['instagram'] = f"https://instagram.com/{ig_matches[0]}"

        # Facebook
        fb_matches = self.FACEBOOK_PATTERN.findall(html)
        if fb_matches:
            result['facebook'] = f"https://facebook.com/{fb_matches[0]}"

        # LinkedIn
        li_matches = self.LINKEDIN_PATTERN.findall(html)
        if li_matches:
            result['linkedin'] = f"https://linkedin.com/company/{li_matches[0]}"

        return result

    def _extract_curriculum(self, text: str) -> Optional[str]:
        """Detectar curriculum/metodologia."""
        curriculums = ['montessori', 'waldorf', 'construtivista', 'bilíngue', 'anarquia educacional']
        for curr in curriculums:
            if curr.lower() in text.lower():
                return curr.title()
        return None

    def _extract_accreditation(self, text: str) -> Optional[str]:
        """Detectar acreditações/certificações."""
        keywords = ['mec', 'inep', 'iso', 'cambridge', 'concurso', 'enem']
        found = []
        for keyword in keywords:
            if keyword.lower() in text.lower():
                found.append(keyword.upper())
        return ' · '.join(found) if found else None


async def crawl_batch(
    urls: List[str],
    timeout: int = 10,
    max_workers: int = 5,
    headless: bool = True,
) -> List[CrawlResult]:
    """
    Fazer crawl de múltiplas URLs em paralelo (com semáforo de workers).

    Args:
        urls: Lista de URLs
        timeout: Timeout por página
        max_workers: Máximo de páginas simultâneas
        headless: Rodar sem interface

    Returns:
        Lista de CrawlResult
    """
    crawler = SchoolCrawler(timeout=timeout, headless=headless)
    await crawler.init()

    semaphore = asyncio.Semaphore(max_workers)

    async def crawl_with_semaphore(url: str) -> CrawlResult:
        async with semaphore:
            return await crawler.crawl(url)

    try:
        results = await asyncio.gather(
            *[crawl_with_semaphore(url) for url in urls],
            return_exceptions=False,
        )
        return results
    finally:
        await crawler.cleanup()


def crawl_csv(
    input_path: str,
    output_path: str,
    timeout: int = 10,
    workers: int = 5,
    url_column: str = 'website',
):
    """
    Fazer crawl de sites em um CSV.

    Args:
        input_path: Caminho do CSV de entrada (deve ter coluna 'website')
        output_path: Caminho do CSV de saída
        timeout: Timeout por página em segundos
        workers: Máximo de workers simultâneos
        url_column: Nome da coluna com URLs
    """
    LOG.info(f"Carregando {input_path}...")
    df = pd.read_csv(input_path)

    if url_column not in df.columns:
        raise ValueError(f"Coluna '{url_column}' não encontrada em {input_path}")

    # URLs válidas
    urls = df[url_column].fillna('').astype(str).str.strip()
    urls = urls[urls.str.len() > 0].unique().tolist()
    LOG.info(f"Encontrados {len(urls)} URLs únicas para crawl")

    # Executar crawl
    LOG.info(f"Iniciando crawl com {workers} workers, timeout={timeout}s...")
    results = asyncio.run(crawl_batch(urls, timeout=timeout, max_workers=workers))

    # Mapear resultados de volta para o dataframe
    results_by_url = {r.website: r for r in results}

    df['crawled_email'] = df[url_column].map(lambda url: results_by_url.get(url, CrawlResult(url)).email)
    df['crawled_phone'] = df[url_column].map(lambda url: results_by_url.get(url, CrawlResult(url)).phone)
    df['crawled_tuition'] = df[url_column].map(lambda url: results_by_url.get(url, CrawlResult(url)).tuition)
    df['crawled_tuition_value'] = df[url_column].map(lambda url: results_by_url.get(url, CrawlResult(url)).tuition_value)
    df['crawled_social_media'] = df[url_column].map(lambda url: results_by_url.get(url, CrawlResult(url)).social_media)
    df['crawled_curriculum'] = df[url_column].map(lambda url: results_by_url.get(url, CrawlResult(url)).curriculum)
    df['crawled_accreditation'] = df[url_column].map(lambda url: results_by_url.get(url, CrawlResult(url)).accreditation)
    df['crawled_error'] = df[url_column].map(lambda url: results_by_url.get(url, CrawlResult(url)).error)

    # Usar email com crawl se disponível, caso contrário usar existente
    if 'email' in df.columns:
        df['email'] = df['crawled_email'].fillna(df['email'])
    else:
        df['email'] = df['crawled_email']

    df.to_csv(output_path, index=False, encoding='utf-8-sig')
    LOG.info(f"✅ Salvo em {output_path}")

    # Estatísticas
    success = sum(1 for r in results if r.success)
    emails_found = sum(1 for r in results if r.email)
    tuitions_found = sum(1 for r in results if r.tuition)
    LOG.info(f"📊 Estatísticas:")
    LOG.info(f"   • Sucesso: {success}/{len(results)} ({100*success/len(results):.1f}%)")
    LOG.info(f"   • Emails encontrados: {emails_found}")
    LOG.info(f"   • Mensalidades encontradas: {tuitions_found}")


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )

    parser = argparse.ArgumentParser(
        description='Web crawler para extrair emails e mensalidades de escolas'
    )
    parser.add_argument('-i', '--input', required=True, help='CSV de entrada')
    parser.add_argument('-o', '--output', required=True, help='CSV de saída')
    parser.add_argument('--timeout', type=int, default=10, help='Timeout por página (s)')
    parser.add_argument('--workers', type=int, default=5, help='Máximo de workers simultâneos')
    parser.add_argument('--url-column', default='website', help='Nome da coluna com URLs')

    args = parser.parse_args()

    crawl_csv(
        args.input,
        args.output,
        timeout=args.timeout,
        workers=args.workers,
        url_column=args.url_column,
    )
