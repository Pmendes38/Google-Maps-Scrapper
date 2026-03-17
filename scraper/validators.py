import re
import unicodedata
from typing import Any, Mapping


SEGMENT_RULES = {
    "creche/berçário": ["creche", "bercario", "berçário", "nursery", "daycare"],
    "educação infantil": ["educacao infantil", "educação infantil", "pre-escola", "pré-escola", "infantil"],
    "ensino fundamental": ["fundamental", "elementary"],
    "ensino médio": ["ensino medio", "ensino médio", "high school", "colegial"],
    "ensino técnico": ["tecnico", "técnico", "tecnologico", "tecnológico"],
    "ensino superior": ["universidade", "faculdade", "college", "graduacao", "graduação"],
    "idiomas/bilíngue": ["idioma", "language", "bilingue", "bilíngue", "bilingual"],
    "ed. básica": ["educacao basica", "educação básica", "basic school"],
}

PRIVATE_KEYWORDS = [
    "colegio",
    "colégio",
    "escola",
    "school",
    "instituto",
    "mackenzie",
    "marista",
    "salesiana",
    "particular",
    "privada",
]

PUBLIC_KEYWORDS = [
    "municipal",
    "estadual",
    "federal",
    "publica",
    "pública",
    "governo",
    "secretaria",
]


def normalize_text(value: str) -> str:
    """Normaliza texto para comparação e matching."""
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text).strip().lower()


def clean_digits(value: str) -> str:
    """Mantém apenas dígitos de um texto."""
    return re.sub(r"\D", "", value or "")


def extract_cep_from_address(address: str) -> str:
    """Extrai CEP no formato de 8 dígitos a partir do endereço do Google Maps."""
    match = re.search(r"(\d{5})-?(\d{3})", address or "")
    return "".join(match.groups()) if match else ""


def format_phone_br(phone_number: str) -> str:
    """Formata telefone brasileiro em E.164 quando possível."""
    digits = clean_digits(phone_number)
    if digits.startswith("55") and len(digits) in {12, 13}:
        return f"+{digits}"
    if len(digits) in {10, 11}:
        return f"+55{digits}"
    return ""


def is_whatsapp_ready(phone_number: str) -> str:
    """Considera pronto para WhatsApp quando há celular BR com 9 dígito."""
    digits = clean_digits(phone_number)
    if digits.startswith("55"):
        digits = digits[2:]
    if len(digits) == 11 and digits[2] == "9":
        return "Sim"
    return "Não"


def classify_school_segment(name: str, place_type: str) -> str:
    """Classifica o segmento da escola com heurística textual."""
    haystack = normalize_text(f"{name} {place_type}")
    for segment, keywords in SEGMENT_RULES.items():
        if any(keyword in haystack for keyword in keywords):
            return segment
    if any(keyword in haystack for keyword in ["colegio", "colégio", "escola", "school"]):
        return "ed. básica"
    return "indefinido"


def is_private_school(name: str, place_type: str) -> str:
    """Infere se o lead representa uma escola privada."""
    haystack = normalize_text(f"{name} {place_type}")
    if any(keyword in haystack for keyword in PUBLIC_KEYWORDS):
        return "Não"
    if any(keyword in haystack for keyword in PRIVATE_KEYWORDS):
        return "Sim"
    return "Indefinido"


def parse_address_components(address: str) -> dict[str, str]:
    """Extrai cidade, estado e um bairro aproximado a partir do endereço."""
    sanitized = re.sub(r"\s+", " ", address or "").strip()
    parts = [part.strip() for part in sanitized.split(",") if part.strip()]
    city = ""
    state = ""
    bairro = ""

    city_state_part = ""
    if len(parts) >= 2 and re.fullmatch(r"\d{5}-?\d{3}", parts[-1]):
        city_state_part = parts[-2]
    elif parts:
        city_state_part = parts[-1]

    city_state_match = re.search(r"([^,\-]+)\s*-\s*([A-Z]{2})$", city_state_part)
    if city_state_match:
        city = city_state_match.group(1).strip()
        state = city_state_match.group(2).strip()

    address_part = ""
    if len(parts) >= 3 and city_state_part == parts[-2]:
        address_part = parts[-3]
    elif len(parts) >= 2:
        address_part = parts[-2]

    if address_part:
        bairro = address_part.split("-")[-1].strip()

    if not bairro and len(parts) >= 2:
        bairro = parts[-2]

    return {"bairro": bairro, "city": city, "state": state}


def calculate_data_quality(data: Mapping[str, Any]) -> str:
    """Calcula um score simples de qualidade para campos críticos do lead."""
    important_fields = [
        "name",
        "phone_number",
        "phone_formatted",
        "website",
        "address",
        "city",
        "state",
        "cep",
        "school_segment",
        "is_private",
        "maps_url",
    ]
    filled = 0
    for field_name in important_fields:
        value = data.get(field_name, "")
        if value not in {"", None, "Indefinido"}:
            filled += 1
    score = round((filled / len(important_fields)) * 100) if important_fields else 0
    return f"{score}%"
