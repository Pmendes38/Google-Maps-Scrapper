import argparse
import logging
import re
import time
from dataclasses import asdict, dataclass, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
from playwright.sync_api import Page, sync_playwright

from scraper.enricher import BrasilAPIEnricher
from scraper.validators import calculate_data_quality, classify_school_segment, extract_cep_from_address, format_phone_br, is_private_school, is_whatsapp_ready, parse_address_components


RESULTS_SELECTOR = 'a[href*="/maps/place"]'
SEARCH_INPUT_SELECTOR = 'input[name="q"], input#searchboxinput, input[aria-label*="Search"], input[aria-label*="Pesquisar"]'


@dataclass
class SchoolLead:
    name: str = ""
    place_type: str = ""
    school_segment: str = ""
    is_private: str = ""
    phone_number: str = ""
    phone_formatted: str = ""
    whatsapp_ready: str = ""
    website: str = ""
    email: str = ""
    address: str = ""
    bairro: str = ""
    city: str = ""
    state: str = ""
    cep: str = ""
    latitude: str = ""
    longitude: str = ""
    reviews_count: Optional[int] = None
    reviews_average: Optional[float] = None
    opens_at: str = ""
    place_id: str = ""
    maps_url: str = ""
    introduction: str = ""
    cep_logradouro: str = ""
    cep_bairro: str = ""
    cep_cidade: str = ""
    cep_uf: str = ""
    cep_lat: str = ""
    cep_lng: str = ""
    cnpj: str = ""
    razao_social: str = ""
    situacao_cadastral: str = ""
    data_abertura: str = ""
    capital_social: str = ""
    porte: str = ""
    cnae_principal: str = ""
    cnae_descricao: str = ""
    socios: str = ""
    inep_code: str = ""
    total_matriculas: str = ""
    matriculas_infantil: str = ""
    matriculas_fundamental: str = ""
    matriculas_medio: str = ""
    ideb_ai: str = ""
    ideb_af: str = ""
    tem_internet: str = ""
    tem_lab_informatica: str = ""
    ai_score: str = ""
    icp_match: str = ""
    pain_points: str = ""
    abordagem_sugerida: str = ""
    prioridade: str = ""
    justificativa_score: str = ""
    pipeline_stage: str = "Novo"
    owner: str = ""
    notes: str = ""
    next_action: str = ""
    last_touch: str = ""
    source: str = "gmaps_scraper"
    scraped_at: str = ""
    enriched_at: str = ""
    scored_at: str = ""
    data_quality: str = ""


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def extract_text(page: Page, selector: str) -> str:
    try:
        locator = page.locator(selector)
        if locator.count() > 0:
            return locator.first.inner_text().strip()
    except Exception as exc:
        logging.warning("Falha ao extrair texto de %s: %s", selector, exc)
    return ""


def extract_place_name(page: Page) -> str:
    try:
        headings = [value.strip() for value in page.locator("h1").all_inner_texts() if value.strip()]
        for heading in reversed(headings):
            if heading.lower() not in {"resultados", "results"}:
                return heading
    except Exception as exc:
        logging.warning("Falha ao extrair nome do lead: %s", exc)
    return ""


def parse_rating_summary(page: Page) -> tuple[Optional[int], Optional[float]]:
    try:
        rating_button = page.locator('button[jsaction*="pane.rating"]').first
        if rating_button.count() == 0:
            return None, None
        rating_label = rating_button.get_attribute("aria-label") or rating_button.inner_text()
        if not rating_label:
            return None, None
        average = None
        count = None
        average_match = re.search(r"(\d+[\.,]\d+)", rating_label)
        if average_match:
            average = float(average_match.group(1).replace(",", "."))
        counts = re.findall(r"\d[\d\.,\s]*", rating_label)
        if counts:
            digits = re.sub(r"\D", "", counts[-1])
            if digits:
                count = int(digits)
        return count, average
    except Exception as exc:
        logging.warning("Falha ao extrair avaliação: %s", exc)
        return None, None


def extract_place_id(candidate_url: str) -> str:
    match = re.search(r"!1s([^!]+)", candidate_url or "")
    return match.group(1) if match else ""


def build_school_lead(page: Page, listing_url: str = "") -> SchoolLead:
    address = extract_text(page, '//button[@data-item-id="address"]//div[contains(@class, "fontBodyMedium")]')
    website = extract_text(page, '//a[@data-item-id="authority"]//div[contains(@class, "fontBodyMedium")]')
    phone_number = extract_text(page, '//button[contains(@data-item-id, "phone:tel:")]//div[contains(@class, "fontBodyMedium")]')
    place_type = extract_text(page, 'button[jsaction*="pane.rating.category"]')
    opens_at = extract_text(page, '//button[contains(@data-item-id, "oh")]')
    name = extract_place_name(page)
    reviews_count, reviews_average = parse_rating_summary(page)
    address_parts = parse_address_components(address)
    phone_formatted = format_phone_br(phone_number)
    maps_url = page.url

    lead = SchoolLead(
        name=name,
        place_type=place_type,
        school_segment=classify_school_segment(name, place_type),
        is_private=is_private_school(name, place_type),
        phone_number=phone_number,
        phone_formatted=phone_formatted,
        whatsapp_ready=is_whatsapp_ready(phone_formatted or phone_number),
        website=website,
        address=address,
        bairro=address_parts["bairro"],
        city=address_parts["city"],
        state=address_parts["state"],
        cep=extract_cep_from_address(address),
        reviews_count=reviews_count,
        reviews_average=reviews_average,
        opens_at=opens_at,
        place_id=extract_place_id(listing_url or maps_url),
        maps_url=maps_url,
        introduction="None Found",
        scraped_at=datetime.now(timezone.utc).isoformat(),
    )
    lead.data_quality = calculate_data_quality(asdict(lead))
    return lead


def enrich_lead(lead: SchoolLead, enricher: BrasilAPIEnricher, enrich_cnpj: bool = False) -> SchoolLead:
    if lead.cep:
        cep_data = enricher.enrich_cep(lead.cep)
        for key, value in cep_data.items():
            setattr(lead, key, value)
        lead.city = lead.city or lead.cep_cidade
        lead.state = lead.state or lead.cep_uf
        lead.bairro = lead.bairro or lead.cep_bairro
        lead.latitude = lead.latitude or lead.cep_lat
        lead.longitude = lead.longitude or lead.cep_lng
    if enrich_cnpj and lead.cnpj:
        cnpj_data = enricher.enrich_cnpj(lead.cnpj)
        for key, value in cnpj_data.items():
            setattr(lead, key, value)
    lead.enriched_at = datetime.now(timezone.utc).isoformat()
    lead.data_quality = calculate_data_quality(asdict(lead))
    return lead


def scrape_schools(search_for: str, total: int, headless: bool = False) -> list[SchoolLead]:
    setup_logging()
    leads: list[SchoolLead] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=headless, args=["--start-maximized"])
        page = browser.new_page()
        try:
            page.goto("https://www.google.com/maps/@-15.793889,-47.882778,10z?entry=ttu", timeout=60000)
            page.wait_for_timeout(1000)
            page.wait_for_selector(SEARCH_INPUT_SELECTOR, timeout=15000)
            search_input = page.locator(SEARCH_INPUT_SELECTOR).first
            search_input.fill(search_for)
            search_input.press("Enter")
            page.wait_for_selector(RESULTS_SELECTOR, timeout=15000)
            page.wait_for_timeout(2000)

            previous_count = 0
            no_new_results_streak = 0
            while True:
                page.evaluate("""
                    () => {
                        const panel = document.querySelector('.m6QErb[aria-label]');
                        if (panel) panel.scrollTop += 3000;
                    }
                """)
                page.wait_for_timeout(1500)
                found = page.locator(RESULTS_SELECTOR).count()
                logging.info("Currently Found: %s", found)
                if found >= total:
                    break
                if found == previous_count:
                    no_new_results_streak += 1
                    if no_new_results_streak >= 3:
                        logging.info("End of list detected with %s results", found)
                        break
                else:
                    no_new_results_streak = 0
                previous_count = found

            listings = page.locator(RESULTS_SELECTOR).all()[:total]
            logging.info("Total Found: %s", len(listings))
            for index, listing in enumerate(listings, start=1):
                try:
                    listing_url = listing.get_attribute("href") or ""
                    listing.scroll_into_view_if_needed()
                    listing.click()
                    page.wait_for_selector('button[data-item-id="address"], a[data-item-id="authority"], button[data-item-id^="phone:"]', timeout=10000)
                    time.sleep(1.0)
                    lead = build_school_lead(page, listing_url)
                    if lead.name:
                        leads.append(lead)
                    else:
                        logging.warning("Lead %s sem nome após clique, ignorando.", index)
                except Exception as exc:
                    logging.warning("Falha ao extrair lead %s: %s", index, exc)
        finally:
            browser.close()
    return leads


def save_leads_to_csv(leads: list[SchoolLead], output_path: str, append: bool = False) -> None:
    field_names = [field.name for field in fields(SchoolLead)]
    dataframe = pd.DataFrame([asdict(lead) for lead in leads], columns=field_names)
    if dataframe.empty:
        logging.warning("Nenhum lead para salvar.")
        return
    text_columns = [field.name for field in fields(SchoolLead) if field.type == str]
    for column in text_columns:
        dataframe[column] = dataframe[column].fillna("").astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
    file_exists = Path(output_path).exists()
    dataframe.to_csv(output_path, index=False, mode="a" if append else "w", header=not (append and file_exists))
    logging.info("Saved %s leads to %s (append=%s)", len(dataframe), output_path, append)


def load_leads_from_csv(input_path: str) -> list[SchoolLead]:
    dataframe = pd.read_csv(input_path).fillna("")
    allowed_fields = {field.name for field in fields(SchoolLead)}
    leads: list[SchoolLead] = []
    for _, row in dataframe.iterrows():
        payload = {key: row[key] for key in dataframe.columns if key in allowed_fields}
        leads.append(SchoolLead(**payload))
    return leads


def enrich_existing_csv(input_path: str, output_path: str, enrich_cnpj: bool = False) -> None:
    setup_logging()
    enricher = BrasilAPIEnricher()
    leads = [enrich_lead(lead, enricher, enrich_cnpj=enrich_cnpj) for lead in load_leads_from_csv(input_path)]
    save_leads_to_csv(leads, output_path, append=False)


def process_cities_file(cities_path: str, total: int, output_path: str, enrich_cnpj: bool, headless: bool) -> None:
    enricher = BrasilAPIEnricher()
    first_batch = True
    cities = [city.strip() for city in Path(cities_path).read_text(encoding="utf-8").splitlines() if city.strip()]
    for city in cities:
        query = city if any(keyword in city.lower() for keyword in ["escola", "colégio", "colegio", "school"]) else f"escolas particulares {city}"
        leads = scrape_schools(query, total, headless=headless)
        leads = [enrich_lead(lead, enricher, enrich_cnpj=enrich_cnpj) for lead in leads]
        save_leads_to_csv(leads, output_path, append=not first_batch)
        first_batch = False


def main() -> None:
    parser = argparse.ArgumentParser(description="Wayzen School Intelligence Platform - Camada 1")
    parser.add_argument("-s", "--search", type=str, help="Consulta de busca no Google Maps")
    parser.add_argument("-t", "--total", type=int, default=20, help="Quantidade máxima de resultados")
    parser.add_argument("-o", "--output", type=str, default="result.csv", help="CSV de saída")
    parser.add_argument("--append", action="store_true", help="Acrescenta resultados ao CSV")
    parser.add_argument("--cities", type=str, help="Arquivo texto com cidades/consultas para múltiplos scrapes")
    parser.add_argument("--enrich-only", action="store_true", help="Enriquece um CSV existente sem novo scrape")
    parser.add_argument("-i", "--input", type=str, help="CSV de entrada para enrich-only")
    parser.add_argument("--enrich-cnpj", action="store_true", help="Ativa enriquecimento CNPJ quando houver CNPJ disponível")
    parser.add_argument("--headless", action="store_true", help="Executa o browser em modo headless")
    args = parser.parse_args()

    if args.enrich_only:
        if not args.input:
            raise SystemExit("Use --input ao executar com --enrich-only.")
        enrich_existing_csv(args.input, args.output, enrich_cnpj=args.enrich_cnpj)
        return
    if args.cities:
        process_cities_file(args.cities, args.total, args.output, args.enrich_cnpj, args.headless)
        return

    search_for = args.search or "escolas particulares Brasília DF"
    enricher = BrasilAPIEnricher()
    leads = scrape_schools(search_for, args.total, headless=args.headless)
    leads = [enrich_lead(lead, enricher, enrich_cnpj=args.enrich_cnpj) for lead in leads]
    save_leads_to_csv(leads, args.output, append=args.append)


if __name__ == "__main__":
    main()
