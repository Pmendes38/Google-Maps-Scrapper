import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { EscolaProfile, EscolaSocio } from "@/lib/types";

type AnyObject = Record<string, unknown>;
type BrasilApiCnpj = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  email?: string;
  porte?: string;
  descricao_porte?: string;
  capital_social?: string | number;
  data_inicio_atividade?: string;
  situacao_cadastral?: string;
  logradouro?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  qsa?: Array<{ nome_socio?: string; qualificacao_socio?: string }>;
};

type CepResponse = {
  city?: string;
  state?: string;
  neighborhood?: string;
  street?: string;
  location?: {
    coordinates?: {
      latitude?: string;
      longitude?: string;
    };
  };
};

const CNPJ_CACHE_TTL_MS = 10 * 60 * 1000;
const cnpjCache = new Map<string, { expiresAt: number; data: BrasilApiCnpj | null }>();

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function toRecord(value: unknown): AnyObject {
  return value && typeof value === "object" ? (value as AnyObject) : {};
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "sim", "true", "s", "y", "yes"].includes(text);
}

function yearsSince(dateText: string | null): number | null {
  if (!dateText) return null;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  const years = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  return Math.max(0, years);
}

function getPath(source: unknown, path: string): unknown {
  const root = toRecord(source);
  const keys = path.split(".");
  let current: unknown = root;

  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as AnyObject)[key];
  }

  return current;
}

function pickFirst(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = getPath(source, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function pickNumber(source: unknown, paths: string[]): number | null {
  const value = pickFirst(source, paths);
  return toNullableNumber(value);
}

function pickString(source: unknown, paths: string[]): string | null {
  const value = pickFirst(source, paths);
  const text = String(value ?? "").trim();
  return text || null;
}

function pickBoolean(source: unknown, paths: string[]): boolean {
  const value = pickFirst(source, paths);
  return toBoolean(value);
}

function normalizeLocalizacao(value: unknown): "Urbana" | "Rural" | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "1" || text.includes("urb")) return "Urbana";
  if (text === "2" || text.includes("rur")) return "Rural";
  return null;
}

function normalizeEtapas(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.entries(value as AnyObject)
      .filter(([, enabled]) => toBoolean(enabled))
      .map(([key]) => key.replace(/_/g, " ").trim())
      .filter(Boolean);
  }

  const text = String(value ?? "").trim();
  if (!text) return [];
  return text
    .split(/,|;|\//)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSocios(cnpjData: BrasilApiCnpj | null): EscolaSocio[] {
  if (!cnpjData?.qsa || !Array.isArray(cnpjData.qsa)) return [];

  return cnpjData.qsa
    .slice(0, 3)
    .map((partner) => ({
      nome: String(partner.nome_socio ?? "").trim() || "Nao informado",
      qualificacao: String(partner.qualificacao_socio ?? "").trim() || "Nao informado",
    }));
}

async function fetchEducacaoInep(inepCode: string): Promise<AnyObject | null> {
  const urls = [
    `http://educacao.dadosabertosbr.com/api/escola/${inepCode}`,
    `https://educacao.dadosabertosbr.com/api/escola/${inepCode}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = (await response.json()) as unknown;
      return toRecord(payload);
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchBrasilApiCnpj(cnpj: string): Promise<BrasilApiCnpj | null> {
  const now = Date.now();
  const cached = cnpjCache.get(cnpj);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { cache: "no-store" });
    if (!response.ok) {
      cnpjCache.set(cnpj, { expiresAt: now + CNPJ_CACHE_TTL_MS, data: null });
      return null;
    }

    const payload = (await response.json()) as BrasilApiCnpj;
    cnpjCache.set(cnpj, { expiresAt: now + CNPJ_CACHE_TTL_MS, data: payload });
    return payload;
  } catch {
    cnpjCache.set(cnpj, { expiresAt: now + CNPJ_CACHE_TTL_MS, data: null });
    return null;
  }
}

async function fetchBrasilApiCep(cep: string): Promise<CepResponse | null> {
  const normalized = normalizeDigits(cep);
  if (normalized.length !== 8) return null;

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${normalized}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as CepResponse;
  } catch {
    return null;
  }
}

async function findLeadByIdentifier(
  supabase: ReturnType<typeof getServerSupabaseClient>["supabase"],
  identifier: string,
): Promise<AnyObject | null> {
  if (!supabase) return null;

  const byId = await supabase.from("school_leads").select("*").eq("id", identifier).maybeSingle();
  if (byId.data) return toRecord(byId.data);

  const byInep = await supabase.from("school_leads").select("*").eq("inep_code", identifier).maybeSingle();
  if (byInep.data) return toRecord(byInep.data);

  const cnpjDigits = normalizeDigits(identifier);
  if (cnpjDigits.length >= 8) {
    const byCnpjExact = await supabase.from("school_leads").select("*").eq("cnpj", cnpjDigits).maybeSingle();
    if (byCnpjExact.data) return toRecord(byCnpjExact.data);

    const byCnpjLike = await supabase
      .from("school_leads")
      .select("*")
      .ilike("cnpj", `%${cnpjDigits}%`)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (byCnpjLike.data && byCnpjLike.data.length > 0) {
      return toRecord(byCnpjLike.data[0]);
    }
  }

  return null;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const identifier = String(params.id ?? "").trim();
  if (!identifier) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }

  const lead = await findLeadByIdentifier(supabase, identifier);
  if (!lead) {
    return NextResponse.json({ error: "Escola não encontrada na base de leads" }, { status: 404 });
  }

  const inepCode = String(lead.inep_code ?? "").trim();
  const cnpjDigits = normalizeDigits(lead.cnpj ?? identifier);

  const educacaoData = inepCode ? await fetchEducacaoInep(inepCode) : null;
  const cnpjData = cnpjDigits.length === 14 ? await fetchBrasilApiCnpj(cnpjDigits) : null;
  const cepDigits = normalizeDigits(lead.cep ?? cnpjData?.cep ?? pickString(educacaoData, ["cep", "endereco.cep"]));
  const cepData = await fetchBrasilApiCep(cepDigits);

  const dataAbertura =
    String(cnpjData?.data_inicio_atividade ?? lead.data_abertura ?? "").trim() || null;

  const lat =
    toNullableNumber(lead.latitude) ??
    toNullableNumber(lead.cep_lat) ??
    pickNumber(educacaoData, ["latitude", "lat", "coordenadas.latitude", "gps.latitude"]) ??
    toNullableNumber(cepData?.location?.coordinates?.latitude);

  const lng =
    toNullableNumber(lead.longitude) ??
    toNullableNumber(lead.cep_lng) ??
    pickNumber(educacaoData, ["longitude", "lng", "coordenadas.longitude", "gps.longitude"]) ??
    toNullableNumber(cepData?.location?.coordinates?.longitude);

  const infraNode = toRecord(pickFirst(educacaoData, ["infraestrutura", "dados_infraestrutura", "infra"]));

  const profile: EscolaProfile = {
    id: String(lead.id ?? identifier),
    name:
      String(
        lead.name ??
          cnpjData?.nome_fantasia ??
          cnpjData?.razao_social ??
          pickString(educacaoData, ["nome", "nomeEscola", "escola"]) ??
          "Escola",
      ).trim() || "Escola",
    inep_code: inepCode || normalizeDigits(identifier),
    cnpj: cnpjDigits || "",
    school_segment: String(lead.school_segment ?? "indefinido"),
    is_private: String(lead.is_private ?? "Indefinido"),
    pipeline_stage: String(lead.pipeline_stage ?? "Novo"),
    ai_score: toNullableNumber(lead.ai_score),
    icp_match: String(lead.icp_match ?? "").trim() || null,
    abordagem_sugerida: String(lead.abordagem_sugerida ?? "").trim() || null,
    pain_points: Array.isArray(lead.pain_points)
      ? (lead.pain_points.map((item) => String(item)) as string[])
      : null,
    phone_formatted: String(lead.phone_formatted ?? "").trim() || null,
    website: String(lead.website ?? "").trim() || null,
    email: String(lead.email ?? cnpjData?.email ?? "").trim() || null,
    address:
      String(
        lead.address ??
          cnpjData?.logradouro ??
          pickString(educacaoData, ["endereco.logradouro", "logradouro"]) ??
          cepData?.street ??
          "",
      ).trim() || null,
    bairro:
      String(
        lead.bairro ??
          cnpjData?.bairro ??
          pickString(educacaoData, ["endereco.bairro", "bairro"]) ??
          cepData?.neighborhood ??
          "",
      ).trim() || null,
    city:
      String(
        lead.city ??
          cnpjData?.municipio ??
          pickString(educacaoData, ["municipio", "cidade", "endereco.municipio"]) ??
          cepData?.city ??
          "",
      ).trim() || null,
    state:
      String(
        lead.state ??
          cnpjData?.uf ??
          pickString(educacaoData, ["uf", "estado", "endereco.uf"]) ??
          cepData?.state ??
          "",
      ).trim() || null,
    cep: cepDigits || null,
    lat,
    lng,
    total_matriculas:
      pickNumber(educacaoData, ["qtdAlunos", "total_alunos", "alunos.total", "matriculas.total"]) ??
      toNullableNumber(lead.total_matriculas),
    total_professores: pickNumber(educacaoData, ["qtdProfessores", "total_professores", "professores"]),
    total_funcionarios:
      pickNumber(educacaoData, ["qtdFuncionarios", "total_funcionarios", "funcionarios"]) ?? null,
    localizacao: normalizeLocalizacao(
      pickFirst(educacaoData, ["localizacao", "tipoLocalizacao", "tp_localizacao"]),
    ),
    ideb_ai:
      pickNumber(educacaoData, ["ideb.ai", "idebAnosIniciais", "nu_ideb_ai"]) ??
      toNullableNumber(lead.ideb_ai),
    ideb_af:
      pickNumber(educacaoData, ["ideb.af", "idebAnosFinais", "nu_ideb_af"]) ??
      toNullableNumber(lead.ideb_af),
    taxa_aprovacao: pickNumber(educacaoData, ["taxaAprovacao", "rendimento.aprovacao", "aprovacao"]),
    taxa_reprovacao: pickNumber(educacaoData, ["taxaReprovacao", "rendimento.reprovacao", "reprovacao"]),
    taxa_abandono: pickNumber(educacaoData, ["taxaAbandono", "rendimento.abandono", "abandono"]),
    etapas_ensino: normalizeEtapas(
      pickFirst(educacaoData, ["etapasEnsino", "etapas_ensino", "etapas", "ofertaEtapas"]),
    ),
    tem_internet:
      pickBoolean(infraNode, ["internet", "temInternet", "in_internet"]) ||
      toBoolean(lead.tem_internet),
    tem_biblioteca: pickBoolean(infraNode, ["biblioteca", "temBiblioteca", "in_biblioteca"]),
    tem_lab_informatica:
      pickBoolean(infraNode, ["laboratorioInformatica", "temLabInformatica", "in_lab_informatica"]) ||
      toBoolean(lead.tem_lab_informatica),
    tem_lab_ciencias: pickBoolean(infraNode, ["laboratorioCiencias", "temLabCiencias", "in_lab_ciencias"]),
    tem_quadra: pickBoolean(infraNode, ["quadraEsportes", "temQuadra", "in_quadra_esportes"]),
    tem_sala_leitura: pickBoolean(infraNode, ["salaLeitura", "temSalaLeitura", "in_sala_leitura"]),
    tem_acessibilidade: pickBoolean(infraNode, ["acessibilidade", "temAcessibilidade", "in_acessibilidade"]),
    tem_auditorio: pickBoolean(infraNode, ["auditorio", "temAuditorio", "in_auditorio"]),
    tem_cozinha: pickBoolean(infraNode, ["cozinha", "temCozinha", "in_cozinha"]),
    tem_banheiro: pickBoolean(infraNode, ["banheiro", "temBanheiro", "in_banheiro"]),
    qtd_salas_aula: pickNumber(educacaoData, ["qtdSalasAula", "salasAula", "salas_aula"]),
    razao_social: String(cnpjData?.razao_social ?? lead.razao_social ?? "").trim() || null,
    capital_social: toNullableNumber(cnpjData?.capital_social) ?? toNullableNumber(lead.capital_social),
    porte:
      String(cnpjData?.porte ?? cnpjData?.descricao_porte ?? lead.porte ?? "").trim() || null,
    data_abertura: dataAbertura,
    anos_operacao: yearsSince(dataAbertura),
    socios: normalizeSocios(cnpjData),
    situacao_cadastral:
      String(cnpjData?.situacao_cadastral ?? lead.situacao_cadastral ?? "").trim() || null,
  };

  return NextResponse.json(profile);
}
