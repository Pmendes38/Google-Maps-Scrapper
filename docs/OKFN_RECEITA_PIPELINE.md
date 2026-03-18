# OKFN Receita - Monthly Pipeline Runbook

Este runbook operacionaliza a trilha de dados massivos da Receita Federal com base no projeto OKFN Receita.

## Objective

Gerar um subset mensal de empresas educacionais (CNAEs 85*) e enviar para staging no Supabase.

## Preconditions

- Instancia local/servidor com o projeto `okfn-brasil/receita` configurado.
- Base relacional da Receita atualizada no mes corrente.
- Variaveis do Wayzen configuradas:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Monthly Flow

1. Atualizar base no ambiente OKFN:
   - Rodar o processo de update mensal da base publica CNPJ no ambiente OKFN.
2. Exportar subset educacional:
   - Filtrar CNAEs de educacao (prefixo `85` ou lista de CNAEs alvo Wayzen).
   - Exportar CSV no formato:
     - `cnpj`
     - `razao_social`
     - `cnae_principal`
     - `cnae_descricao`
     - `municipio`
     - `uf`
     - `capital_social`
     - `porte`
     - `situacao_cadastral`
     - `data_abertura`
3. Salvar CSV em local versionado de operacao (ex: `data/okfn/okfn_educacao_YYYYMM.csv`).
4. Carregar staging no Supabase:
   - Gerar snapshot em `school_source_snapshots` com `source_name='okfn_receita_etl'`.
   - Registrar linhas em `school_source_snapshot_items`.
5. Rodar job corporativo:
   - `python scraper/corporate_enrichment_job.py`
6. Rodar auditoria:
   - `python scraper/lead_quality_audit.py --audit-version v1`

## Recommended SQL Filter (example)

```sql
SELECT
  e.cnpj,
  emp.razao_social,
  e.cnae_fiscal AS cnae_principal,
  c.descricao AS cnae_descricao,
  m.descricao AS municipio,
  m.uf,
  emp.capital_social,
  emp.porte,
  e.situacao_cadastral,
  e.data_inicio_atividade AS data_abertura
FROM estabelecimentos e
JOIN empresas emp ON emp.cnpj_basico = e.cnpj_basico
LEFT JOIN cnaes c ON c.codigo = e.cnae_fiscal
LEFT JOIN municipios m ON m.codigo = e.municipio
WHERE e.cnae_fiscal::text LIKE '85%';
```

## Acceptance Criteria

- Snapshot `okfn_receita_etl` criado com `status='completed'`.
- `records_read > 0` e `records_changed > 0` no snapshot.
- Leads com CNPJ passam a ter cobertura superior de `razao_social/porte/cnae`.
- Auditoria atualiza `school_lead_quality_audits` no mesmo ciclo.
