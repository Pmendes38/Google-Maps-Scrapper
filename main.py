import logging
from typing import List, Optional
from playwright.sync_api import sync_playwright, Page
from dataclasses import dataclass, asdict, fields
import pandas as pd
import argparse
import time
import os
import re

@dataclass
class Place:
    name: str = ""
    address: str = ""
    website: str = ""
    phone_number: str = ""
    reviews_count: Optional[int] = None
    reviews_average: Optional[float] = None
    store_shopping: str = "No"
    in_store_pickup: str = "No"
    store_delivery: str = "No"
    place_type: str = ""
    opens_at: str = ""
    introduction: str = ""

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
    )

def extract_text(page: Page, xpath: str) -> str:
    try:
        if page.locator(xpath).count() > 0:
            return page.locator(xpath).inner_text()
    except Exception as e:
        logging.warning(f"Failed to extract text for xpath {xpath}: {e}")
    return ""

def extract_place_name(page: Page) -> str:
    try:
        headings = [text.strip() for text in page.locator("h1").all_inner_texts() if text.strip()]
        for heading in reversed(headings):
            if heading.lower() not in {"resultados", "results"}:
                return heading
    except Exception as e:
        logging.warning(f"Failed to extract place name: {e}")
    return ""

def extract_place(page: Page) -> Place:
    address_xpath = '//button[@data-item-id="address"]//div[contains(@class, "fontBodyMedium")]'
    website_xpath = '//a[@data-item-id="authority"]//div[contains(@class, "fontBodyMedium")]'
    phone_number_xpath = '//button[contains(@data-item-id, "phone:tel:")]//div[contains(@class, "fontBodyMedium")]'
    opens_at_xpath = '//button[contains(@data-item-id, "oh")]'
    place_type_xpath = 'button[jsaction*="pane.rating.category"]'

    place = Place()
    place.name = extract_place_name(page)
    place.address = extract_text(page, address_xpath)
    place.website = extract_text(page, website_xpath)
    place.phone_number = extract_text(page, phone_number_xpath)
    place.place_type = extract_text(page, place_type_xpath)
    place.introduction = "None Found"

    rating_label = ""
    try:
        rating_button = page.locator('button[jsaction*="pane.rating"]').first
        if rating_button.count() > 0:
            rating_label = rating_button.get_attribute("aria-label") or rating_button.inner_text()
    except Exception as e:
        logging.warning(f"Failed to extract rating summary: {e}")

    if rating_label:
        try:
            avg_match = re.search(r"(\d+[\.,]\d+)", rating_label)
            if avg_match:
                place.reviews_average = float(avg_match.group(1).replace(',', '.'))
            counts = re.findall(r"\d[\d\.,\s]*", rating_label)
            if counts:
                count_value = re.sub(r"\D", "", counts[-1])
                if count_value:
                    place.reviews_count = int(count_value)
        except Exception as e:
            logging.warning(f"Failed to parse rating summary '{rating_label}': {e}")

    try:
        main_panel_text = page.locator('div[role="main"]').last.inner_text().lower()
        if any(k in main_panel_text for k in ["in-store shopping", "na loja", "loja física"]):
            place.store_shopping = "Yes"
        if any(k in main_panel_text for k in ["in-store pickup", "retirada", "pick up"]):
            place.in_store_pickup = "Yes"
        if any(k in main_panel_text for k in ["delivery", "entrega"]):
            place.store_delivery = "Yes"
    except Exception as e:
        logging.warning(f"Failed to extract service info: {e}")

    # Opens At
    opens_at_raw = extract_text(page, opens_at_xpath)
    if opens_at_raw:
        opens = opens_at_raw.split('·')
        if len(opens) > 1:
            place.opens_at = opens[1].replace("\u202f","")
        else:
            place.opens_at = opens_at_raw.replace("\u202f","")
    return place

def scrape_places(search_for: str, total: int) -> List[Place]:
    setup_logging()
    places: List[Place] = []
    results_selector = 'a[href*="/maps/place"]'
    search_input_selector = 'input[name="q"], input#searchboxinput, input[aria-label*="Search"], input[aria-label*="Pesquisar"]'
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--start-maximized"],
        )
        page = browser.new_page()
        try:
            page.goto("https://www.google.com/maps/@32.9817464,70.1930781,3.67z?", timeout=60000)
            page.wait_for_timeout(1000)
            page.wait_for_selector(search_input_selector, timeout=15000)
            search_input = page.locator(search_input_selector).first
            search_input.fill(search_for)
            search_input.press("Enter")

            page.wait_for_selector(results_selector, timeout=15000)
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
                found = page.locator(results_selector).count()
                logging.info(f"Currently Found: {found}")
                if found >= total:
                    break

                if found == previous_count:
                    no_new_results_streak += 1
                    if no_new_results_streak >= 3:
                        logging.info(f"End of list detected with {found} results")
                        break
                else:
                    no_new_results_streak = 0
                previous_count = found

            listings = page.locator(results_selector).all()[:total]
            logging.info(f"Total Found: {len(listings)}")
            for idx, listing in enumerate(listings):
                try:
                    listing.scroll_into_view_if_needed()
                    listing.click()
                    page.wait_for_selector('button[data-item-id="address"], a[data-item-id="authority"], button[data-item-id^="phone:"]', timeout=10000)
                    time.sleep(1.5)  # Give time for details to load
                    place = extract_place(page)
                    if place.name:
                        places.append(place)
                    else:
                        logging.warning(f"No name found for listing {idx+1}, skipping.")
                except Exception as e:
                    logging.warning(f"Failed to extract listing {idx+1}: {e}")
        finally:
            browser.close()
    return places

def save_places_to_csv(places: List[Place], output_path: str = "result.csv", append: bool = False):
    field_names = [field.name for field in fields(Place)]
    df = pd.DataFrame([asdict(place) for place in places], columns=field_names)
    if not df.empty:
        for column in ["name", "address", "website", "phone_number", "place_type", "opens_at", "introduction"]:
            df[column] = df[column].fillna("").astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
        file_exists = os.path.isfile(output_path)
        mode = "a" if append else "w"
        header = not (append and file_exists)
        df.to_csv(output_path, index=False, mode=mode, header=header)
        logging.info(f"Saved {len(df)} places to {output_path} (append={append})")
    else:
        logging.warning("No data to save. DataFrame is empty.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-s", "--search", type=str, help="Search query for Google Maps")
    parser.add_argument("-t", "--total", type=int, help="Total number of results to scrape")
    parser.add_argument("-o", "--output", type=str, default="result.csv", help="Output CSV file path")
    parser.add_argument("--append", action="store_true", help="Append results to the output file instead of overwriting")
    args = parser.parse_args()
    search_for = args.search or "turkish stores in toronto Canada"
    total = args.total or 1
    output_path = args.output
    append = args.append
    places = scrape_places(search_for, total)
    save_places_to_csv(places, output_path, append=append)

if __name__ == "__main__":
    main()
