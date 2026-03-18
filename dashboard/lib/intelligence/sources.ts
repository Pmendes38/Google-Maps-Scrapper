export type SourceCategory =
  | "education_census"
  | "education_indicator"
  | "company_registry"
  | "geodata"
  | "quality_utils"
  | "synthetic_data";

export type AccessMode = "public" | "restricted" | "dataset_download" | "internal_or_unknown";
export type Maturity = "production" | "pilot" | "experimental";

export type IntelligenceSource = {
  id: string;
  name: string;
  category: SourceCategory;
  provider: string;
  baseUrl: string;
  access: AccessMode;
  maturity: Maturity;
  priority: 1 | 2 | 3;
  useCases: string[];
  notes?: string;
};

export const INTELLIGENCE_SOURCES: IntelligenceSource[] = [
  {
    id: "inep_microdados_censo_escolar",
    name: "INEP Microdados Censo Escolar",
    category: "education_census",
    provider: "INEP",
    baseUrl: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar",
    access: "dataset_download",
    maturity: "production",
    priority: 1,
    useCases: ["base mestra de escolas", "docentes/turmas/matriculas", "infraestrutura"],
  },
  {
    id: "api_dados_abertos_inep",
    name: "API Dados Abertos INEP (comunidade)",
    category: "education_indicator",
    provider: "dadosabertosinep.org",
    baseUrl: "http://api.dadosabertosinep.org/v1/",
    access: "public",
    maturity: "experimental",
    priority: 2,
    useCases: ["ideb", "indicadores por municipio/uf"],
    notes: "Endpoint historicamente instavel. Usar como fonte complementar com fallback.",
  },
  {
    id: "mec_dados_abertos",
    name: "Portal de Dados Abertos MEC",
    category: "education_census",
    provider: "MEC",
    baseUrl: "https://dadosabertos.mec.gov.br/",
    access: "public",
    maturity: "production",
    priority: 2,
    useCases: ["datasets educacionais federais", "programas e indicadores"],
  },
  {
    id: "brasilapi_cnpj_cep",
    name: "BrasilAPI (CNPJ/CEP)",
    category: "company_registry",
    provider: "BrasilAPI",
    baseUrl: "https://brasilapi.com.br/",
    access: "public",
    maturity: "production",
    priority: 1,
    useCases: ["enriquecimento CNPJ", "enriquecimento endereco/geocodificacao via CEP"],
  },
  {
    id: "minha_receita_api",
    name: "Minha Receita API",
    category: "company_registry",
    provider: "minhareceita.org",
    baseUrl: "https://minhareceita.org/",
    access: "public",
    maturity: "production",
    priority: 1,
    useCases: ["discovery por cnae/uf/municipio", "fallback de enriquecimento corporativo"],
    notes: "Suporta cursor para paginação de resultados.",
  },
  {
    id: "viacep",
    name: "ViaCEP",
    category: "geodata",
    provider: "ViaCEP",
    baseUrl: "https://viacep.com.br/",
    access: "public",
    maturity: "production",
    priority: 2,
    useCases: ["fallback de CEP", "normalizacao de endereco"],
  },
  {
    id: "receitaws",
    name: "ReceitaWS",
    category: "company_registry",
    provider: "ReceitaWS",
    baseUrl: "https://www.receitaws.com.br/",
    access: "public",
    maturity: "pilot",
    priority: 2,
    useCases: ["fallback de consulta CNPJ quando BrasilAPI indisponivel"],
  },
  {
    id: "cnpj_ws_commercial",
    name: "CNPJ.ws (API comercial)",
    category: "company_registry",
    provider: "CNPJ.ws",
    baseUrl: "https://docs.cnpj.ws/",
    access: "restricted",
    maturity: "pilot",
    priority: 2,
    useCases: ["fallback pago de discovery quando Minha Receita indisponivel", "consulta corporativa com SLA"],
    notes: "Uso condicionado a token e endpoint comercial configurado via ambiente.",
  },
  {
    id: "conecta_gov_consulta_cnpj",
    name: "Consulta CNPJ (Conecta Gov / RFB)",
    category: "company_registry",
    provider: "Receita Federal do Brasil",
    baseUrl: "https://www.gov.br/conecta/catalogo/apis/consulta-cnpj",
    access: "restricted",
    maturity: "production",
    priority: 1,
    useCases: ["dados cadastrais oficiais de CNPJ", "validacao corporativa oficial"],
    notes: "Requer OAuth2 + whitelist de IP via firewall.",
  },
  {
    id: "ibge_localidades",
    name: "IBGE API Localidades",
    category: "geodata",
    provider: "IBGE",
    baseUrl: "https://servicodados.ibge.gov.br/api/docs",
    access: "public",
    maturity: "production",
    priority: 1,
    useCases: ["normalizacao UF/municipio", "chaves territoriais oficiais"],
  },
  {
    id: "brazilian_utils",
    name: "brazilian-utils/javascript",
    category: "quality_utils",
    provider: "brazilian-utils",
    baseUrl: "https://github.com/brazilian-utils/javascript",
    access: "public",
    maturity: "production",
    priority: 2,
    useCases: ["validacao/formatacao CPF/CNPJ/telefone/CEP no frontend e backend"],
  },
  {
    id: "faker_br",
    name: "faker-br",
    category: "synthetic_data",
    provider: "tamnil",
    baseUrl: "https://github.com/tamnil/faker-br",
    access: "public",
    maturity: "pilot",
    priority: 3,
    useCases: ["geracao de massa sintetica para testes", "qa de pipeline"],
  },
  {
    id: "public_apis_reference",
    name: "public-apis/public-apis",
    category: "geodata",
    provider: "public-apis community",
    baseUrl: "https://github.com/public-apis/public-apis",
    access: "public",
    maturity: "production",
    priority: 2,
    useCases: ["curadoria de APIs candidatas", "monitor de novas fontes"],
  },
  {
    id: "okfn_receita_etl",
    name: "OKFN Receita (ETL relacional)",
    category: "company_registry",
    provider: "OKFN Brasil",
    baseUrl: "https://github.com/okfn-brasil/receita",
    access: "dataset_download",
    maturity: "production",
    priority: 2,
    useCases: ["pipeline mensal da base completa CNPJ", "filtros locais por cnae e municipio"],
    notes: "Trilha oficial para cobertura nacional completa a medio prazo.",
  },
  {
    id: "opencorporates",
    name: "OpenCorporates",
    category: "company_registry",
    provider: "OpenCorporates",
    baseUrl: "https://api.opencorporates.com",
    access: "public",
    maturity: "production",
    priority: 3,
    useCases: ["contexto corporativo internacional de grupos empresariais"],
  },
  {
    id: "opensanctions",
    name: "OpenSanctions",
    category: "company_registry",
    provider: "OpenSanctions",
    baseUrl: "https://www.opensanctions.org/",
    access: "public",
    maturity: "production",
    priority: 3,
    useCases: ["compliance/KYC em contas corporativas sensiveis"],
  },
];
