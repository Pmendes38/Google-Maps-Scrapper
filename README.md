# Wayzen Extractor

Fase 1 do blueprint da Wayzen School Intelligence Platform. O projeto agora combina scraping resiliente no Google Maps com uma camada inicial de normalização, enriquecimento público e ETL do Censo Escolar.

## Estrutura

- `main.py`: wrapper compatível com o entrypoint antigo.
- `scraper/main.py`: CLI principal de scraping e enriquecimento.
- `scraper/validators.py`: normalização, segmentação escolar e score básico de qualidade.
- `scraper/enricher.py`: enriquecimento com CEP e CNPJ via APIs públicas.
- `scraper/inep_etl.py`: ETL do INEP e match com leads coletados.
- `supabase/migrations/`: schema inicial para persistência no Supabase/PostgreSQL.

## Requisitos

- Python 3.11+
- Playwright Chromium instalado

## Instalação

1. Criar e ativar o ambiente virtual:

```bash
python -m venv .venv311
.venv311\Scripts\activate
```

2. Instalar dependências:

```bash
pip install -r requirements.txt
```

3. Instalar o navegador do Playwright:

```bash
playwright install chromium
```

## Scraping

Coleta simples de escolas particulares:

```bash
python main.py -s "Escolas particulares Brasília DF" -t 20 -o brasilia_private_schools.csv
```

Coleta com append:

```bash
python main.py -s "Escolas particulares Goiânia GO" -t 20 -o centro_oeste_schools.csv --append
```

Coleta em lote a partir de um arquivo texto com uma cidade por linha:

```bash
python main.py --cities cidades.txt -t 20 -o schools_batch.csv
```

Enriquecimento de um CSV existente:

```bash
python main.py --enrich-only -i brasilia_private_schools.csv -o brasilia_private_schools_enriched.csv
```

## ETL INEP

Extrair escolas privadas ativas do ZIP dos microdados:

```bash
python scraper\inep_etl.py --zip CENSO_ESCOLAR_2025.zip --output data\inep_private_schools.csv
```

Enriquecer leads existentes com match por CNPJ ou nome:

```bash
python scraper\inep_etl.py --zip CENSO_ESCOLAR_2025.zip --output data\inep_private_schools.csv --leads-input brasilia_private_schools.csv --leads-output brasilia_private_schools_inep.csv
```

## Saída CSV

O CSV segue schema fixo orientado ao objeto `SchoolLead`, incluindo:

- identificação do lead
- contato e endereço normalizados
- inferência de segmento escolar
- metadados de scraping
- campos reservados para enriquecimento, score e pipeline

## Banco de Dados

As migrations iniciais já foram adicionadas em `supabase/migrations/` para:

- `school_leads`
- `inep_schools`

## Observações

- O scraping continua sensível a mudanças no DOM do Google Maps, mas agora usa seletores mais tolerantes.
- O browser roda visível por padrão. Use `--headless` quando o fluxo estiver estável no seu ambiente.
- O matching do INEP usa `fuzzywuzzy` com aceleração via `python-Levenshtein`.

## Licença

MIT