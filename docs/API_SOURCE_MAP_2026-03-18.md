# API Source Map (2026-03-18)

## Objetivo
Definir as fontes de dados que sustentam a plataforma definitiva de analise, identificacao, extracao e tratamento de leads escolares.

## Fontes Prioridade 1 (producao)

### 1) INEP Microdados Censo Escolar
- URL: https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar
- Tipo: download oficial (dataset)
- Papel no produto:
  - base mestra nacional de escolas
  - docentes, turmas, matriculas, infraestrutura
  - chave universal `codigo_inep` para merge entre fontes

### 2) BrasilAPI (CNPJ + CEP)
- URL: https://brasilapi.com.br/
- Tipo: API publica (uso com limites e boas praticas)
- Papel no produto:
  - enriquecimento de empresa (razao social, porte, capital, situacao)
  - enriquecimento de endereco/geodados (CEP)

### 3) IBGE Localidades API
- URL: https://servicodados.ibge.gov.br/api/docs
- Tipo: API publica
- Papel no produto:
  - normalizacao de UF/municipio
  - codigos territoriais oficiais
  - padronizacao de dimensoes de BI

### 4) Conecta GOV – Consulta CNPJ (RFB)
- URL: https://www.gov.br/conecta/catalogo/apis/consulta-cnpj
- Tipo: API governamental restrita
- Papel no produto:
  - fonte oficial de dados cadastrais empresariais
- Requisito:
  - OAuth2/JWT + whitelist de IP (firewall)

## Fontes Prioridade 2 (complementares)

### 5) API Dados Abertos INEP (comunidade)
- URL base: http://api.dadosabertosinep.org/v1/
- Papel:
  - complementar IDEB/indicadores em consultas online
- Observacao:
  - nao deve ser a unica fonte de missao critica; usar fallback.

### 6) QEdu (fonte de referencia de exibicao)
- URL: https://qedu.org.br/
- Papel:
  - benchmark de UX e modelagem de visao por escola
  - referencia para painel de indicadores por unidade
- Observacao:
  - tratar como integracao cuidadosa (respeitar termos/robots/politica de uso).

### 7) Public APIs (curadoria)
- URL: https://github.com/public-apis/public-apis
- Entradas relevantes para discovery:
  - Government: `Brazil (BrasilAPI)` / `Brazil Receita WS`
  - Geocoding: `ViaCEP`
  - Open Data: `OpenCorporates`, `OpenSanctions`, `Universities List`
- Papel:
  - radar de novas fontes e redundancias.

### 7.1) Fallbacks praticos para o nicho escolar brasileiro
- ReceitaWS: https://www.receitaws.com.br/
- ViaCEP: https://viacep.com.br/
- OpenCorporates: https://api.opencorporates.com
- OpenSanctions: https://www.opensanctions.org/

## Fontes Prioridade 3 (operacao interna e QA)

### 8) brazilian-utils/javascript
- URL: https://github.com/brazilian-utils/javascript
- Papel:
  - validacao/formatacao de CPF/CNPJ/CEP/telefone
  - saneamento de entrada para reduzir lixo em pipeline

### 9) faker-br
- URL: https://github.com/tamnil/faker-br
- Papel:
  - geracao de massa sintetica para testes de pipeline e dashboards
  - QA de performance sem expor dados reais

## Decisoes de arquitetura

1. `codigo_inep` sera a chave universal de escola.
2. `cnpj` sera a chave corporativa, com normalizacao numerica obrigatoria.
3. Toda fonte externa deve passar por camada de adaptador com:
   - timeout curto
   - retry controlado
   - fallback
   - telemetria por fonte.
4. Enriquecimento deve ser incremental e idempotente (upsert por `place_id` + `inep_code` + `cnpj`).

## Riscos e mitigacao

- Fonte externa fora do ar:
  - manter snapshot local (bronze/silver/gold) e retentativas.
- Rate limit:
  - fila + janela de processamento + cache por chave.
- Divergencia entre fontes:
  - score de confianca por campo (oficial > comunitaria > scraping).
