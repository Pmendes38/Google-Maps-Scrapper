# Roadmap – Ferramenta Definitiva de Leads Escolares

## Norte do produto
Construir uma plataforma com:
- ingestao oficial (INEP/MEC/IBGE/RFB)
- enriquecimento empresarial e geoespacial
- pipeline comercial com IA
- governanca de qualidade e rastreabilidade por fonte

## Fase 0 (ja iniciada)
- Dashboard em Next.js com busca, pipeline, mapa e perfil de escola.
- Scoring heuristico e salvamento no Supabase.

## Fase 1 (foundation de dados)
1. Criar tabela `school_source_snapshots` para armazenar bruto por fonte.
2. Criar tabela `school_quality_audit` com score de completude por lead.
3. Criar rotina ETL de microdados INEP -> `inep_schools` (incremental).
4. Normalizacao obrigatoria:
   - cnpj: 14 digitos
   - cep: 8 digitos
   - codigo_inep: string numerica

## Fase 2 (motor de enriquecimento)
1. Orquestrador por etapas:
   - etapa A: censo oficial
   - etapa B: empresa (CNPJ)
   - etapa C: geodata
   - etapa D: canais de contato (site/rede)
2. Contrato padrao por conector:
   - `fetch()`
   - `normalize()`
   - `confidence()`
3. Telemetria por fonte:
   - latencia
   - taxa de sucesso
   - campos preenchidos

## Fase 3 (inteligencia comercial)
1. Score multiobjetivo:
   - aderencia ICP
   - maturidade digital
   - potencial de ticket
   - urgencia comercial
2. IA generativa:
   - abordagem sugerida por persona
   - pain points por tipo de escola
   - proxima melhor acao no pipeline

## Fase 4 (escala e operacao)
1. Jobs assíncronos (fila) para enriquecimento em lote.
2. Cache de consultas externas por chave (`cnpj`, `inep_code`, `cep`).
3. Modo offline:
   - leitura de snapshots + replay de enriquecimento.

## KPIs de plataforma
- Cobertura de contato (% leads com telefone+email+site).
- Cobertura de qualificacao (% leads com score + ICP + prioridade).
- Tempo de enriquecimento por lead (P50/P95).
- Taxa de conversao por faixa de score.

## Entregas tecnicas adicionadas nesta iteracao
- Catalogo de fontes em `dashboard/lib/intelligence/sources.ts`.
- Endpoint de fontes: `GET /api/intelligence/sources`.
- Endpoint de enriquecimento unificado: `POST /api/intelligence/enrich`.

