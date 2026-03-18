import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { computeIcpFitScore } from "@/lib/icp-scoring";
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
  descricao_situacao_cadastral?: string;
  logradouro?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  qsa?: Array<{ nome_socio?: string; qualificacao_socio?: string }>;
};

type CompanyProfile = BrasilApiCnpj & {
  socios?: Array<{ nome?: string; qualificacao?: string; nome_socio?: string; qualificacao_socio?: string }>;
  QSA?: Array<{ nome_socio?: string; qualificacao_socio?: string; nome?: string; qualificacao?: string }>;
  ddd_telefone_1?: string;
  telefone_1?: string;
  telefones?: Array<{ ddd?: string | number; numero?: string | number; is_fax?: boolean }>;
  site?: string;
  website?: string;
  endereco?: string;
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

type IneqRow = {
  co_entidade: string;
  no_entidade: string | null;
  cnpj: string | null;
  tp_rede: number | null;
  qt_mat_bas: number | null;
  qt_mat_inf: number | null;
  qt_mat_fund: number | null;
  qt_mat_med: number | null;
  nu_ideb_ai: number | null;
  nu_ideb_af: number | null;
  in_internet: boolean | number | null;
  in_lab_informatica: boolean | number | null;
  no_municipio: string | null;
  sg_uf: string | null;
};

type QEduSyncData = {
  school: AnyObject | null;
  censo: AnyObject | null;
  trRows: AnyObject[];
  censoAno: number | null;
  trAno: number | null;
  dependencia: string | null;
  dependenciaId: number | null;
  localizacao: string | null;
  localizacaoId: number | null;
  situacaoFuncionamento: string | null;
  totalMatriculas: number | null;
  totalProfessores: number | null;
  totalFuncionarios: number | null;
  taxaAprovacao: number | null;
  taxaReprovacao: number | null;
  taxaAbandono: number | null;
  etapasEnsino: string[];
  temInternet: boolean | null;
  temBiblioteca: boolean | null;
  temLabInformatica: boolean | null;
  temLabCiencias: boolean | null;
  temQuadra: boolean | null;
  temSalaLeitura: boolean | null;
  temAcessibilidade: boolean | null;
  temAuditorio: boolean | null;
  temCozinha: boolean | null;
  temBanheiro: boolean | null;
  hash: string;
  syncedAt: string;
};

type QEduCacheRow = {
  qedu_school: AnyObject | null;
  qedu_censo: AnyObject | null;
  qedu_tr: AnyObject | null;
  dependencia: string | null;
  localizacao: string | null;
  situacao_funcionamento: string | null;
  censo_ano: number | null;
  tr_ano: number | null;
  qtd_matriculas: number | null;
  qtd_professores: number | null;
  qtd_funcionarios: number | null;
  taxa_aprovacao: number | null;
  taxa_reprovacao: number | null;
  taxa_abandono: number | null;
  last_synced_at: string | null;
};

const CNPJ_CACHE_TTL_MS = 10 * 60 * 1000;
const QEDU_TIMEOUT_MS = 9000;
const QEDU_BASE_URL = (process.env.QEDU_API_BASE_URL?.trim() || "http://api.qedu.org.br/v1").replace(/\/+$/, "");
const cnpjCache = new Map<string, { expiresAt: number; data: CompanyProfile | null }>();

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function toRecord(value: unknown): AnyObject {
  return value && typeof value === "object" ? (value as AnyObject) : {};
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text) return null;

  // Preserve decimal precision for coordinates and indicators.
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^-?\d+(,\d+)?$/.test(text)) {
    const parsed = Number(text.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const hasDot = text.includes(".");
  const hasComma = text.includes(",");
  if (hasDot && hasComma) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    text = text.replace(",", ".");
  }

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

function normalizeSocios(cnpjData: CompanyProfile | null, fallback: unknown): EscolaSocio[] {
  const fromCnpj = extractSociosFromAny(cnpjData);
  const fromFallback = Array.isArray(fallback)
    ? (fallback as Array<Record<string, unknown>>)
    : extractSociosFromAny(fallback);
  const source = fromCnpj.length > 0 ? fromCnpj : fromFallback;

  return source
    .map((partner) => {
      const row = partner && typeof partner === "object" ? (partner as Record<string, unknown>) : {};
      const nome = String(row.nome ?? row.nome_socio ?? "").trim();
      const qualificacao = String(row.qualificacao ?? row.qualificacao_socio ?? "").trim();
      if (!nome && !qualificacao) return null;
      return {
        nome: nome || "Nao informado",
        qualificacao: qualificacao || "Nao informado",
      };
    })
    .filter((item): item is EscolaSocio => Boolean(item))
    .slice(0, 5);
}

function inferSegmentFromInep(row: IneqRow | null): string {
  if (!row) return "indefinido";
  if (Number(row.qt_mat_med ?? 0) > 0) return "ensino medio";
  if (Number(row.qt_mat_fund ?? 0) > 0) return "ensino fundamental";
  if (Number(row.qt_mat_inf ?? 0) > 0) return "educacao infantil";
  if (Number(row.qt_mat_bas ?? 0) > 0) return "ed. basica";
  return "indefinido";
}

function inferIsPrivateFromTpRede(tpRede: number | null): string {
  if (tpRede === 4) return "Sim";
  if (tpRede === 1 || tpRede === 2 || tpRede === 3) return "Nao";
  return "Indefinido";
}

function isValidCoordinate(value: number | null, min: number, max: number): boolean {
  if (value === null || !Number.isFinite(value)) return false;
  return value >= min && value <= max;
}

function isValidLatLng(lat: number | null, lng: number | null): boolean {
  return isValidCoordinate(lat, -90, 90) && isValidCoordinate(lng, -180, 180) && !(lat === 0 && lng === 0);
}

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function pickCoordinatePair(candidates: Array<{ lat: number | null; lng: number | null }>): {
  lat: number | null;
  lng: number | null;
} {
  for (const candidate of candidates) {
    if (isValidLatLng(candidate.lat, candidate.lng)) {
      return candidate;
    }
  }

  return { lat: null, lng: null };
}

function extractSociosFromAny(source: unknown): Array<Record<string, unknown>> {
  const record = toRecord(source);
  const candidates = [record.qsa, record.QSA, record.socios, record.quadro_societario];
  const first = candidates.find((item) => Array.isArray(item));
  return Array.isArray(first) ? (first as Array<Record<string, unknown>>) : [];
}

function extractCompanyPhone(cnpjData: CompanyProfile | null): string | null {
  if (!cnpjData) return null;

  const direct = normalizePhone(cnpjData.ddd_telefone_1 ?? cnpjData.telefone_1);
  if (direct.length >= 10) return `+55${direct}`;

  const fromPairs = normalizePhone(`${cnpjData.ddd_telefone_1 ?? ""}${cnpjData.telefone_1 ?? ""}`);
  if (fromPairs.length >= 10) return `+55${fromPairs}`;

  if (Array.isArray(cnpjData.telefones)) {
    const phoneEntry = cnpjData.telefones.find((entry) => entry && entry.is_fax !== true) ?? cnpjData.telefones[0];
    if (phoneEntry) {
      const composed = normalizePhone(`${phoneEntry.ddd ?? ""}${phoneEntry.numero ?? ""}`);
      if (composed.length >= 10) return `+55${composed}`;
    }
  }

  return null;
}

function parseCapitalSocial(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let raw = String(value).trim();
  if (!raw) return null;
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  if (hasDot && hasComma) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    raw = raw.replace(",", ".");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrencyBR(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Nao informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function tpRedeToDependencia(tpRede: number | null): string | null {
  if (tpRede === 1) return "Federal";
  if (tpRede === 2) return "Estadual";
  if (tpRede === 3) return "Municipal";
  if (tpRede === 4) return "Privada";
  return null;
}

function dependenciaToIsPrivate(dependencia: string | null): string {
  const text = String(dependencia ?? "").trim().toLowerCase();
  if (!text) return "Indefinido";
  if (text.includes("priv")) return "Sim";
  if (
    text.includes("federal") ||
    text.includes("estadual") ||
    text.includes("municipal") ||
    text.includes("public")
  ) {
    return "Nao";
  }
  return "Indefinido";
}

function buildRecentYears(startYear: number, count: number): number[] {
  const years: number[] = [];
  for (let i = 0; i < count; i += 1) {
    years.push(startYear - i);
  }
  return years;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function inferEtapasFromQEduCenso(censo: AnyObject | null): string[] {
  if (!censo) return [];

  const stages: string[] = [];
  const appendIf = (value: unknown, label: string) => {
    const count = toNullableNumber(value) ?? 0;
    if (count > 0) stages.push(label);
  };

  appendIf(censo.matriculas_creche, "Creche");
  appendIf(censo.matriculas_pre_escolar, "Educacao infantil");
  appendIf(censo.matriculas_anos_iniciais, "Ensino fundamental (anos iniciais)");
  appendIf(censo.matriculas_anos_finais, "Ensino fundamental (anos finais)");
  appendIf(censo.matriculas_ensino_medio, "Ensino medio");
  appendIf(censo.matriculas_eja, "EJA");

  return stages;
}

function summarizeTaxaRendimento(rows: AnyObject[]): {
  taxaAprovacao: number | null;
  taxaReprovacao: number | null;
  taxaAbandono: number | null;
} {
  let weightTotal = 0;
  let sumAprovacao = 0;
  let sumReprovacao = 0;
  let sumAbandono = 0;

  for (const row of rows) {
    const aprovados = toNullableNumber(row.aprovados);
    const reprovados = toNullableNumber(row.reprovados);
    const abandonos = toNullableNumber(row.abandonos);

    if (aprovados === null && reprovados === null && abandonos === null) continue;

    const weight = Math.max(1, toNullableNumber(row.matriculas) ?? 1);
    weightTotal += weight;
    sumAprovacao += (aprovados ?? 0) * weight;
    sumReprovacao += (reprovados ?? 0) * weight;
    sumAbandono += (abandonos ?? 0) * weight;
  }

  if (weightTotal <= 0) {
    return {
      taxaAprovacao: null,
      taxaReprovacao: null,
      taxaAbandono: null,
    };
  }

  const round2 = (value: number) => Math.round(value * 100) / 100;

  return {
    taxaAprovacao: round2(sumAprovacao / weightTotal),
    taxaReprovacao: round2(sumReprovacao / weightTotal),
    taxaAbandono: round2(sumAbandono / weightTotal),
  };
}

async function fetchQEduList(
  token: string,
  path: string,
  params: Record<string, string | number | null | undefined>,
): Promise<AnyObject[] | null> {
  if (!token) return null;

  const url = new URL(`${QEDU_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(QEDU_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const payload = toRecord(await response.json());
    const data = Array.isArray(payload.data) ? payload.data : [];
    return data.map((item) => toRecord(item));
  } catch {
    return null;
  }
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

async function fetchBrasilApiCnpj(cnpj: string): Promise<CompanyProfile | null> {
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

    const payload = (await response.json()) as CompanyProfile;
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

async function fetchOpenCnpj(cnpj: string): Promise<AnyObject | null> {
  try {
    const response = await fetch(`https://api.opencnpj.org/${cnpj}`, { cache: "no-store" });
    if (!response.ok) return null;
    return toRecord(await response.json());
  } catch {
    return null;
  }
}

function mergeCompanyData(
  primary: CompanyProfile | null,
  fallback: AnyObject | null,
  lead: AnyObject | null,
): CompanyProfile | null {
  if (!primary && !fallback && !lead) return null;
  const fb = fallback ?? {};

  const fallbackQsa = Array.isArray(fb.qsa)
    ? fb.qsa
    : Array.isArray((fb as AnyObject).QSA)
      ? ((fb as AnyObject).QSA as unknown[])
    : Array.isArray(fb.socios)
      ? fb.socios
      : Array.isArray(fb.quadro_societario)
        ? fb.quadro_societario
        : [];

  const merged: CompanyProfile = {
    ...(primary ?? {}),
    cnpj:
      String(primary?.cnpj ?? fb.cnpj ?? lead?.cnpj ?? "").trim() ||
      undefined,
    razao_social:
      String(primary?.razao_social ?? fb.razao_social ?? fb.razaoSocial ?? lead?.razao_social ?? "").trim() ||
      undefined,
    nome_fantasia:
      String(primary?.nome_fantasia ?? fb.nome_fantasia ?? fb.nomeFantasia ?? lead?.name ?? "").trim() || undefined,
    cep: String(primary?.cep ?? fb.cep ?? lead?.cep ?? "").trim() || undefined,
    email: String(primary?.email ?? fb.email ?? lead?.email ?? "").trim() || undefined,
    porte:
      String(primary?.porte ?? primary?.descricao_porte ?? fb.porte ?? fb.descricao_porte ?? lead?.porte ?? "").trim() ||
      undefined,
    capital_social:
      parseCapitalSocial(primary?.capital_social ?? fb.capital_social ?? fb.capitalSocial ?? lead?.capital_social) ??
      undefined,
    data_inicio_atividade:
      String(primary?.data_inicio_atividade ?? fb.data_inicio_atividade ?? fb.abertura ?? lead?.data_abertura ?? "").trim() ||
      undefined,
    situacao_cadastral:
      String(
        primary?.situacao_cadastral ??
          primary?.descricao_situacao_cadastral ??
          fb.situacao_cadastral ??
          fb.descricao_situacao_cadastral ??
          lead?.situacao_cadastral ??
          "",
      ).trim() || undefined,
    logradouro:
      String(primary?.logradouro ?? fb.logradouro ?? fb.endereco ?? lead?.address ?? "").trim() || undefined,
    bairro: String(primary?.bairro ?? fb.bairro ?? lead?.bairro ?? "").trim() || undefined,
    municipio: String(primary?.municipio ?? fb.municipio ?? lead?.city ?? "").trim() || undefined,
    uf: String(primary?.uf ?? fb.uf ?? lead?.state ?? "").trim() || undefined,
    ddd_telefone_1:
      String(primary?.ddd_telefone_1 ?? fb.ddd_telefone_1 ?? fb.ddd ?? "").trim() || undefined,
    telefone_1:
      String(primary?.telefone_1 ?? fb.telefone_1 ?? fb.telefone ?? "").trim() || undefined,
    qsa: Array.isArray(primary?.qsa) && primary.qsa.length > 0 ? primary.qsa : (fallbackQsa as BrasilApiCnpj["qsa"]),
    socios: Array.isArray(fb.socios)
      ? (fb.socios as CompanyProfile["socios"])
      : Array.isArray((fb as AnyObject).QSA)
        ? (((fb as AnyObject).QSA as unknown[]) as CompanyProfile["socios"])
        : undefined,
    QSA: Array.isArray((fb as AnyObject).QSA)
      ? (((fb as AnyObject).QSA as unknown[]) as CompanyProfile["QSA"])
      : undefined,
    telefones: Array.isArray((fb as AnyObject).telefones)
      ? (((fb as AnyObject).telefones as unknown[]) as CompanyProfile["telefones"])
      : undefined,
    site: String(primary?.site ?? fb.site ?? lead?.website ?? "").trim() || undefined,
    website: String(primary?.website ?? fb.website ?? lead?.website ?? "").trim() || undefined,
    endereco: String((fb as AnyObject).endereco ?? "").trim() || undefined,
  };

  return merged;
}

async function fetchQEduSyncData(inepCode: string, token: string): Promise<QEduSyncData | null> {
  if (!inepCode || !token) return null;

  const schoolRows = await fetchQEduList(token, "/escolas", { inep_id: inepCode });
  const school = schoolRows && schoolRows.length > 0 ? schoolRows[0] : null;
  if (!school) return null;

  const now = new Date();
  const censoYears = buildRecentYears(now.getUTCFullYear() - 1, 8);
  let censo: AnyObject | null = null;
  let censoAno: number | null = null;

  for (const year of censoYears) {
    const rows = await fetchQEduList(token, "/censo/escola", { inep_id: inepCode, ano: year });
    if (rows && rows.length > 0) {
      censo = rows[0];
      censoAno = year;
      break;
    }
  }

  const trYears = buildRecentYears(now.getUTCFullYear(), 8);
  let trRows: AnyObject[] = [];
  let trAno: number | null = null;
  const dependenciaId = toNullableNumber(school.dependencia_id);

  for (const year of trYears) {
    const rows = await fetchQEduList(token, "/indicador/tr/escola", {
      inep_id: inepCode,
      ano: year,
      dependencia_id: dependenciaId,
    });
    if (rows && rows.length > 0) {
      trRows = rows;
      trAno = year;
      break;
    }
  }

  const trSummary = summarizeTaxaRendimento(trRows);

  const totalMatriculas = [
    censo?.matriculas_creche,
    censo?.matriculas_pre_escolar,
    censo?.matriculas_anos_iniciais,
    censo?.matriculas_anos_finais,
    censo?.matriculas_ensino_medio,
    censo?.matriculas_eja,
    censo?.matriculas_educacao_especial,
  ]
    .map((value) => toNullableNumber(value) ?? 0)
    .reduce((acc, current) => acc + current, 0);

  const rawPayload = { school, censo, trRows, censoAno, trAno };

  return {
    school,
    censo,
    trRows,
    censoAno,
    trAno,
    dependencia: pickString(school, ["dependencia"]),
    dependenciaId,
    localizacao: pickString(school, ["localizacao"]),
    localizacaoId: toNullableNumber(school.localizacao_id),
    situacaoFuncionamento: pickString(school, ["situacao_funcionamento"]),
    totalMatriculas: totalMatriculas > 0 ? totalMatriculas : null,
    totalProfessores: toNullableNumber(censo?.outros_num_docentes),
    totalFuncionarios: toNullableNumber(censo?.outros_num_funcionarios),
    taxaAprovacao: trSummary.taxaAprovacao,
    taxaReprovacao: trSummary.taxaReprovacao,
    taxaAbandono: trSummary.taxaAbandono,
    etapasEnsino: inferEtapasFromQEduCenso(censo),
    temInternet: censo ? toBoolean(censo.tecnologia_internet) : null,
    temBiblioteca: censo ? toBoolean(censo.dependencias_biblioteca) : null,
    temLabInformatica: censo ? toBoolean(censo.dependencias_lab_informatica) : null,
    temLabCiencias: censo ? toBoolean(censo.dependencias_lab_ciencias) : null,
    temQuadra: censo ? toBoolean(censo.dependencias_quadra_esportes) : null,
    temSalaLeitura: censo ? toBoolean(censo.dependencias_sala_leitura) : null,
    temAcessibilidade: censo ? toBoolean(censo.acessibilidade_escola) : null,
    temAuditorio: censo ? toBoolean(censo.dependencias_sala_diretora) : null,
    temCozinha: censo ? toBoolean(censo.dependencias_cozinha) : null,
    temBanheiro: censo
      ? toBoolean(censo.dependencias_sanitario_dentro_predio) || toBoolean(censo.dependencias_sanitario_fora_predio)
      : null,
    hash: hashPayload(rawPayload),
    syncedAt: new Date().toISOString(),
  };
}

async function readQEduCache(
  supabase: ReturnType<typeof getServerSupabaseClient>["supabase"],
  inepCode: string,
): Promise<QEduCacheRow | null> {
  if (!supabase || !inepCode) return null;

  const { data, error } = await supabase
    .from("school_qedu_profiles")
    .select("*")
    .eq("inep_code", inepCode)
    .maybeSingle();

  if (error || !data) return null;

  const row = toRecord(data);
  return {
    qedu_school: toRecord(row.qedu_school),
    qedu_censo: toRecord(row.qedu_censo),
    qedu_tr: toRecord(row.qedu_tr),
    dependencia: pickString(row, ["dependencia"]),
    localizacao: pickString(row, ["localizacao"]),
    situacao_funcionamento: pickString(row, ["situacao_funcionamento"]),
    censo_ano: toNullableNumber(row.censo_ano),
    tr_ano: toNullableNumber(row.tr_ano),
    qtd_matriculas: toNullableNumber(row.qtd_matriculas),
    qtd_professores: toNullableNumber(row.qtd_professores),
    qtd_funcionarios: toNullableNumber(row.qtd_funcionarios),
    taxa_aprovacao: toNullableNumber(row.taxa_aprovacao),
    taxa_reprovacao: toNullableNumber(row.taxa_reprovacao),
    taxa_abandono: toNullableNumber(row.taxa_abandono),
    last_synced_at: pickString(row, ["last_synced_at"]),
  };
}

async function persistQEduSync(
  supabase: ReturnType<typeof getServerSupabaseClient>["supabase"],
  leadId: string | null,
  inepCode: string,
  qedu: QEduSyncData,
): Promise<void> {
  if (!supabase || !inepCode) return;

  try {
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("school_qedu_profiles")
      .select("qedu_hash")
      .eq("inep_code", inepCode)
      .maybeSingle();

    if (existing && String(existing.qedu_hash ?? "") === qedu.hash) {
      await supabase
        .from("school_qedu_profiles")
        .update({
          lead_id: leadId,
          last_synced_at: qedu.syncedAt,
        })
        .eq("inep_code", inepCode);
      return;
    }

    let sourceSnapshotId: string | null = null;

    const { data: sourceRows } = await supabase
      .from("school_source_snapshots")
      .insert([
        {
          source_name: "qedu_api",
          source_version: "v1",
          snapshot_mode: "incremental",
          watermark: `inep:${inepCode}:${now}`,
          status: "running",
          metadata: {
            inep_code: inepCode,
            created_by: "api_escola_profile",
          },
          started_at: now,
        },
      ])
      .select("id")
      .limit(1);

    if (sourceRows && sourceRows.length > 0) {
      sourceSnapshotId = String(sourceRows[0].id ?? "") || null;
    }

    if (sourceSnapshotId) {
      await supabase.from("school_source_snapshot_items").upsert(
        [
          {
            snapshot_id: sourceSnapshotId,
            entity_type: "school",
            entity_id: inepCode,
            entity_hash: qedu.hash,
            payload: {
              school: qedu.school,
              censo: qedu.censo,
              trRows: qedu.trRows,
              censoAno: qedu.censoAno,
              trAno: qedu.trAno,
            },
          },
        ],
        { onConflict: "snapshot_id,entity_type,entity_id" },
      );
    }

    await supabase.from("school_qedu_profiles").upsert(
      {
        lead_id: leadId,
        inep_code: inepCode,
        source_snapshot_id: sourceSnapshotId,
        qedu_hash: qedu.hash,
        qedu_school: qedu.school ?? {},
        qedu_censo: qedu.censo ?? {},
        qedu_tr: { rows: qedu.trRows },
        qedu_raw: {
          school: qedu.school,
          censo: qedu.censo,
          trRows: qedu.trRows,
          censoAno: qedu.censoAno,
          trAno: qedu.trAno,
        },
        dependencia_id: qedu.dependenciaId,
        dependencia: qedu.dependencia,
        localizacao_id: qedu.localizacaoId,
        localizacao: qedu.localizacao,
        situacao_funcionamento: qedu.situacaoFuncionamento,
        censo_ano: qedu.censoAno,
        tr_ano: qedu.trAno,
        qtd_matriculas: qedu.totalMatriculas,
        qtd_professores: qedu.totalProfessores,
        qtd_funcionarios: qedu.totalFuncionarios,
        taxa_aprovacao: qedu.taxaAprovacao,
        taxa_reprovacao: qedu.taxaReprovacao,
        taxa_abandono: qedu.taxaAbandono,
        last_synced_at: qedu.syncedAt,
      },
      { onConflict: "inep_code" },
    );

    if (sourceSnapshotId) {
      await supabase
        .from("school_source_snapshots")
        .update({
          status: "completed",
          records_read: 1,
          records_changed: 1,
          records_upserted: 1,
          finished_at: new Date().toISOString(),
        })
        .eq("id", sourceSnapshotId);
    }
  } catch {
    // Ignore persistence errors to keep profile endpoint resilient.
  }
}

async function syncLeadWithQEdu(
  supabase: ReturnType<typeof getServerSupabaseClient>["supabase"],
  leadId: string | null,
  qedu: QEduSyncData,
): Promise<void> {
  if (!supabase || !leadId) return;

  const patch: Record<string, unknown> = {
    enriched_at: qedu.syncedAt,
    updated_at: qedu.syncedAt,
  };

  if (qedu.totalMatriculas !== null) patch.total_matriculas = qedu.totalMatriculas;
  if (qedu.temInternet !== null) patch.tem_internet = qedu.temInternet;
  if (qedu.temLabInformatica !== null) patch.tem_lab_informatica = qedu.temLabInformatica;

  if (qedu.school) {
    const city = pickString(qedu.school, ["cidade", "municipio"]);
    const state = pickString(qedu.school, ["sigla", "uf"]);
    const address = pickString(qedu.school, ["endereco"]);
    const bairro = pickString(qedu.school, ["bairro"]);
    const cep = normalizeDigits(qedu.school.cep);

    if (city) patch.city = city;
    if (state) patch.state = state;
    if (address) patch.address = address;
    if (bairro) patch.bairro = bairro;
    if (cep.length === 8) patch.cep = cep;
  }

  await supabase.from("school_leads").update(patch).eq("id", leadId);
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

async function findInepByIdentifier(
  supabase: ReturnType<typeof getServerSupabaseClient>["supabase"],
  identifier: string,
): Promise<IneqRow | null> {
  if (!supabase) return null;

  const digits = normalizeDigits(identifier);
  if (!digits) return null;

  const byCode = await supabase
    .from("inep_schools")
    .select("*")
    .eq("co_entidade", digits)
    .maybeSingle();

  if (byCode.data) return byCode.data as IneqRow;
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
  const inepFallback = lead ? null : await findInepByIdentifier(supabase, identifier);
  if (!lead && !inepFallback) {
    return NextResponse.json({ error: "Escola não encontrada na base" }, { status: 404 });
  }

  const leadId = String(lead?.id ?? "").trim() || null;
  const inepCode = String(lead?.inep_code ?? inepFallback?.co_entidade ?? "").trim();
  const cnpjDigits = normalizeDigits(lead?.cnpj ?? inepFallback?.cnpj ?? identifier);

  const qeduCache = inepCode ? await readQEduCache(supabase, inepCode) : null;
  let qedu: QEduSyncData | null = null;
  let qeduStatus: EscolaProfile["qedu_status"] = qeduCache ? "cache" : "unavailable";

  const qeduToken = String(process.env.QEDU_API_KEY ?? "").trim();
  if (inepCode && qeduToken) {
    qedu = await fetchQEduSyncData(inepCode, qeduToken);
    if (qedu) {
      qeduStatus = "live";
      await persistQEduSync(supabase, leadId, inepCode, qedu);
      await syncLeadWithQEdu(supabase, leadId, qedu);
    }
  }

  const qeduSchool = qedu?.school ?? qeduCache?.qedu_school ?? null;
  const qeduCenso = qedu?.censo ?? qeduCache?.qedu_censo ?? null;
  const qeduDependencia = qedu?.dependencia ?? qeduCache?.dependencia ?? null;
  const qeduLocalizacao = qedu?.localizacao ?? qeduCache?.localizacao ?? null;
  const qeduSituacao = qedu?.situacaoFuncionamento ?? qeduCache?.situacao_funcionamento ?? null;
  const qeduEtapas = qedu?.etapasEnsino ?? inferEtapasFromQEduCenso(qeduCenso);

  const educacaoData = inepCode ? await fetchEducacaoInep(inepCode) : null;
  const cnpjPrimary = cnpjDigits.length === 14 ? await fetchBrasilApiCnpj(cnpjDigits) : null;
  const cnpjFallback = !cnpjPrimary && cnpjDigits.length === 14 ? await fetchOpenCnpj(cnpjDigits) : null;
  const cnpjData = mergeCompanyData(cnpjPrimary, cnpjFallback, lead);
  const cepDigits = normalizeDigits(
    lead?.cep ?? cnpjData?.cep ?? qeduSchool?.cep ?? pickString(educacaoData, ["cep", "endereco.cep"]),
  );
  const cepData = await fetchBrasilApiCep(cepDigits);

  const dataAbertura =
    String(cnpjData?.data_inicio_atividade ?? lead?.data_abertura ?? "").trim() || null;

  const selectedCoords = pickCoordinatePair([
    {
      lat: toNullableNumber(lead?.latitude),
      lng: toNullableNumber(lead?.longitude),
    },
    {
      lat: toNullableNumber(lead?.cep_lat),
      lng: toNullableNumber(lead?.cep_lng),
    },
    {
      lat: toNullableNumber(qeduSchool?.lat ?? qeduSchool?.latitude),
      lng: toNullableNumber(qeduSchool?.long ?? qeduSchool?.lng ?? qeduSchool?.longitude),
    },
    {
      lat: pickNumber(educacaoData, ["latitude", "lat", "coordenadas.latitude", "gps.latitude"]),
      lng: pickNumber(educacaoData, ["longitude", "lng", "coordenadas.longitude", "gps.longitude"]),
    },
    {
      lat: toNullableNumber(cepData?.location?.coordinates?.latitude),
      lng: toNullableNumber(cepData?.location?.coordinates?.longitude),
    },
  ]);

  const infraNode = toRecord(pickFirst(educacaoData, ["infraestrutura", "dados_infraestrutura", "infra"]));

  const profile: EscolaProfile = {
    id: String(lead?.id ?? inepCode ?? identifier),
    name:
      String(
        lead?.name ??
          pickString(qeduSchool, ["nome"]) ??
          inepFallback?.no_entidade ??
          cnpjData?.nome_fantasia ??
          cnpjData?.razao_social ??
          pickString(educacaoData, ["nome", "nomeEscola", "escola"]) ??
          "Escola",
      ).trim() || "Escola",
    inep_code: inepCode || normalizeDigits(identifier),
    cnpj: cnpjDigits || "",
    school_segment: String(lead?.school_segment ?? inferSegmentFromInep(inepFallback)),
    is_private: String(
      lead?.is_private ??
        dependenciaToIsPrivate(qeduDependencia) ??
        inferIsPrivateFromTpRede(inepFallback?.tp_rede ?? null),
    ),
    pipeline_stage: String(lead?.pipeline_stage ?? "Novo"),
    dependencia_administrativa: qeduDependencia ?? tpRedeToDependencia(inepFallback?.tp_rede ?? null),
    situacao_funcionamento: qeduSituacao,
    ai_score: toNullableNumber(lead?.ai_score),
    icp_match: String(lead?.icp_match ?? "").trim() || null,
    abordagem_sugerida: String(lead?.abordagem_sugerida ?? "").trim() || null,
    pain_points: Array.isArray(lead?.pain_points)
      ? (lead?.pain_points?.map((item) => String(item)) as string[])
      : null,
    phone_formatted:
      String(lead?.phone_formatted ?? "").trim() ||
      (() => {
        const ddd = String(qeduSchool?.ddd ?? cnpjData?.ddd_telefone_1 ?? "").trim();
        const qeduPhone = normalizePhone(qeduSchool?.telefone);
        const cnpjPhone = normalizePhone(cnpjData?.telefone_1);
        const phone = qeduPhone || cnpjPhone;
        if (ddd && phone) return `+55${ddd}${phone}`;
        const extractedCompanyPhone = extractCompanyPhone(cnpjData);
        if (extractedCompanyPhone) return extractedCompanyPhone;
        const localPhone = normalizePhone(lead?.phone_number);
        if (localPhone.length >= 10) return `+55${localPhone}`;
        return null;
      })(),
    website: String(lead?.website ?? cnpjData?.site ?? cnpjData?.website ?? "").trim() || null,
    email: String(lead?.email ?? cnpjData?.email ?? qeduSchool?.email ?? "").trim() || null,
    address:
      String(
        lead?.address ??
          cnpjData?.logradouro ??
          pickString(qeduSchool, ["endereco"]) ??
          pickString(educacaoData, ["endereco.logradouro", "logradouro"]) ??
          cepData?.street ??
          "",
      ).trim() || null,
    bairro:
      String(
        lead?.bairro ??
          cnpjData?.bairro ??
          pickString(qeduSchool, ["bairro"]) ??
          pickString(educacaoData, ["endereco.bairro", "bairro"]) ??
          cepData?.neighborhood ??
          "",
      ).trim() || null,
    city:
      String(
        lead?.city ??
          pickString(qeduSchool, ["cidade", "municipio"]) ??
          inepFallback?.no_municipio ??
          cnpjData?.municipio ??
          pickString(educacaoData, ["municipio", "cidade", "endereco.municipio"]) ??
          cepData?.city ??
          "",
      ).trim() || null,
    state:
      String(
        lead?.state ??
          pickString(qeduSchool, ["sigla", "uf"]) ??
          inepFallback?.sg_uf ??
          cnpjData?.uf ??
          pickString(educacaoData, ["uf", "estado", "endereco.uf"]) ??
          cepData?.state ??
          "",
      ).trim() || null,
    cep: cepDigits || null,
    lat: selectedCoords.lat,
    lng: selectedCoords.lng,
    total_matriculas:
      qedu?.totalMatriculas ??
      qeduCache?.qtd_matriculas ??
      pickNumber(educacaoData, ["qtdAlunos", "total_alunos", "alunos.total", "matriculas.total"]) ??
      toNullableNumber(lead?.total_matriculas) ??
      toNullableNumber(inepFallback?.qt_mat_bas),
    total_professores:
      qedu?.totalProfessores ??
      qeduCache?.qtd_professores ??
      pickNumber(educacaoData, ["qtdProfessores", "total_professores", "professores"]),
    total_funcionarios:
      qedu?.totalFuncionarios ??
      qeduCache?.qtd_funcionarios ??
      pickNumber(educacaoData, ["qtdFuncionarios", "total_funcionarios", "funcionarios"]) ?? null,
    localizacao:
      normalizeLocalizacao(qeduLocalizacao) ??
      normalizeLocalizacao(pickFirst(educacaoData, ["localizacao", "tipoLocalizacao", "tp_localizacao"])),
    ideb_ai:
      pickNumber(educacaoData, ["ideb.ai", "idebAnosIniciais", "nu_ideb_ai"]) ??
      toNullableNumber(lead?.ideb_ai) ??
      toNullableNumber(inepFallback?.nu_ideb_ai),
    ideb_af:
      pickNumber(educacaoData, ["ideb.af", "idebAnosFinais", "nu_ideb_af"]) ??
      toNullableNumber(lead?.ideb_af) ??
      toNullableNumber(inepFallback?.nu_ideb_af),
    taxa_aprovacao:
      qedu?.taxaAprovacao ??
      qeduCache?.taxa_aprovacao ??
      pickNumber(educacaoData, ["taxaAprovacao", "rendimento.aprovacao", "aprovacao"]),
    taxa_reprovacao:
      qedu?.taxaReprovacao ??
      qeduCache?.taxa_reprovacao ??
      pickNumber(educacaoData, ["taxaReprovacao", "rendimento.reprovacao", "reprovacao"]),
    taxa_abandono:
      qedu?.taxaAbandono ??
      qeduCache?.taxa_abandono ??
      pickNumber(educacaoData, ["taxaAbandono", "rendimento.abandono", "abandono"]),
    qedu_status: qeduStatus,
    qedu_last_sync_at: qedu?.syncedAt ?? qeduCache?.last_synced_at ?? null,
    qedu_censo_ano: qedu?.censoAno ?? qeduCache?.censo_ano ?? null,
    qedu_tr_ano: qedu?.trAno ?? qeduCache?.tr_ano ?? null,
    etapas_ensino:
      qeduEtapas.length > 0
        ? qeduEtapas
        : normalizeEtapas(pickFirst(educacaoData, ["etapasEnsino", "etapas_ensino", "etapas", "ofertaEtapas"])),
    tem_internet:
      (qedu?.temInternet ?? toBoolean(qeduCenso?.tecnologia_internet)) ||
      pickBoolean(infraNode, ["internet", "temInternet", "in_internet"]) ||
      toBoolean(lead?.tem_internet) ||
      toBoolean(inepFallback?.in_internet),
    tem_biblioteca:
      (qedu?.temBiblioteca ?? toBoolean(qeduCenso?.dependencias_biblioteca)) ||
      pickBoolean(infraNode, ["biblioteca", "temBiblioteca", "in_biblioteca"]),
    tem_lab_informatica:
      (qedu?.temLabInformatica ?? toBoolean(qeduCenso?.dependencias_lab_informatica)) ||
      pickBoolean(infraNode, ["laboratorioInformatica", "temLabInformatica", "in_lab_informatica"]) ||
      toBoolean(lead?.tem_lab_informatica) ||
      toBoolean(inepFallback?.in_lab_informatica),
    tem_lab_ciencias:
      (qedu?.temLabCiencias ?? toBoolean(qeduCenso?.dependencias_lab_ciencias)) ||
      pickBoolean(infraNode, ["laboratorioCiencias", "temLabCiencias", "in_lab_ciencias"]),
    tem_quadra:
      (qedu?.temQuadra ?? toBoolean(qeduCenso?.dependencias_quadra_esportes)) ||
      pickBoolean(infraNode, ["quadraEsportes", "temQuadra", "in_quadra_esportes"]),
    tem_sala_leitura:
      (qedu?.temSalaLeitura ?? toBoolean(qeduCenso?.dependencias_sala_leitura)) ||
      pickBoolean(infraNode, ["salaLeitura", "temSalaLeitura", "in_sala_leitura"]),
    tem_acessibilidade:
      (qedu?.temAcessibilidade ?? toBoolean(qeduCenso?.acessibilidade_escola)) ||
      pickBoolean(infraNode, ["acessibilidade", "temAcessibilidade", "in_acessibilidade"]),
    tem_auditorio:
      (qedu?.temAuditorio ?? toBoolean(qeduCenso?.dependencias_sala_diretora)) ||
      pickBoolean(infraNode, ["auditorio", "temAuditorio", "in_auditorio"]),
    tem_cozinha:
      (qedu?.temCozinha ?? toBoolean(qeduCenso?.dependencias_cozinha)) ||
      pickBoolean(infraNode, ["cozinha", "temCozinha", "in_cozinha"]),
    tem_banheiro:
      (qedu?.temBanheiro ??
        (toBoolean(qeduCenso?.dependencias_sanitario_dentro_predio) ||
          toBoolean(qeduCenso?.dependencias_sanitario_fora_predio))) ||
      pickBoolean(infraNode, ["banheiro", "temBanheiro", "in_banheiro"]),
    qtd_salas_aula: pickNumber(educacaoData, ["qtdSalasAula", "salasAula", "salas_aula"]),
    razao_social: String(cnpjData?.razao_social ?? lead?.razao_social ?? "").trim() || null,
    capital_social: parseCapitalSocial(cnpjData?.capital_social) ?? toNullableNumber(lead?.capital_social),
    porte:
      String(cnpjData?.porte ?? cnpjData?.descricao_porte ?? lead?.porte ?? "").trim() || null,
    data_abertura: dataAbertura,
    anos_operacao: yearsSince(dataAbertura),
    socios: normalizeSocios(cnpjData, lead?.socios),
    situacao_cadastral:
      String(
        cnpjData?.descricao_situacao_cadastral ??
          cnpjData?.situacao_cadastral ??
          lead?.situacao_cadastral ??
          "",
      ).trim() || null,
    icp_justificativa: null,
    icp_criteria: [],
  };

  const computedIcp = computeIcpFitScore({
    schoolSegment: profile.school_segment,
    isPrivate: profile.is_private === "Sim",
    totalMatriculas: profile.total_matriculas,
    matriculasInfantil:
      toNullableNumber(inepFallback?.qt_mat_inf) ?? toNullableNumber(qeduCenso?.matriculas_pre_escolar),
    matriculasFundamental:
      toNullableNumber(inepFallback?.qt_mat_fund) ??
      ((toNullableNumber(qeduCenso?.matriculas_anos_iniciais) ?? 0) +
        (toNullableNumber(qeduCenso?.matriculas_anos_finais) ?? 0)),
    matriculasMedio:
      toNullableNumber(inepFallback?.qt_mat_med) ?? toNullableNumber(qeduCenso?.matriculas_ensino_medio),
    hasPhone: Boolean(profile.phone_formatted),
    hasAddressOrWebsite: Boolean(profile.address || profile.website),
    estimatedRevenue: (profile.total_matriculas ?? 0) * 700,
  });

  profile.ai_score = computedIcp.score;
  profile.icp_match = computedIcp.icpMatch;
  profile.icp_justificativa = computedIcp.justificativa;
  if (!profile.abordagem_sugerida) profile.abordagem_sugerida = computedIcp.abordagem;
  if (!profile.pain_points || profile.pain_points.length === 0) profile.pain_points = computedIcp.painPoints;

  const hasPhone = Boolean(profile.phone_formatted);
  const hasAddressOrWebsite = Boolean(profile.address || profile.website);
  const etapasText = [
    toNullableNumber(inepFallback?.qt_mat_inf) ?? toNullableNumber(qeduCenso?.matriculas_pre_escolar) ? "EI" : null,
    toNullableNumber(inepFallback?.qt_mat_fund) ??
    ((toNullableNumber(qeduCenso?.matriculas_anos_iniciais) ?? 0) + (toNullableNumber(qeduCenso?.matriculas_anos_finais) ?? 0))
      ? "EF"
      : null,
    toNullableNumber(inepFallback?.qt_mat_med) ?? toNullableNumber(qeduCenso?.matriculas_ensino_medio) ? "EM" : null,
  ]
    .filter(Boolean)
    .join(" + ");

  profile.icp_criteria = [
    {
      id: "segmento",
      label: "Segmento",
      max_points: 25,
      points: computedIcp.dimensions.d1Segmento,
      school_value: `${profile.school_segment} | ${profile.is_private}`,
      analysis: computedIcp.dimensions.d1Segmento >= 20 ? "Forte aderencia ao ICP." : "Aderencia parcial ao ICP.",
    },
    {
      id: "faturamento",
      label: "Faturamento estimado",
      max_points: 30,
      points: computedIcp.dimensions.d2Faturamento,
      school_value: formatCurrencyBR(computedIcp.estimatedRevenue),
      analysis:
        computedIcp.dimensions.d2Faturamento >= 25
          ? "Faixa de receita ideal para escala comercial."
          : "Receita estimada abaixo da faixa ideal.",
    },
    {
      id: "conversao",
      label: "Dependencia de conversao",
      max_points: 20,
      points: computedIcp.dimensions.d3DependenciaConversao,
      school_value: etapasText || "Nao informado",
      analysis:
        computedIcp.dimensions.d3DependenciaConversao >= 20
          ? "Alta dependencia de captacao e conversao."
          : "Dependencia moderada de conversao.",
    },
    {
      id: "contato",
      label: "Dados de contato",
      max_points: 10,
      points: computedIcp.dimensions.d4Contato,
      school_value: `Telefone: ${hasPhone ? "sim" : "nao"} | Site/Endereco: ${hasAddressOrWebsite ? "sim" : "nao"}`,
      analysis:
        computedIcp.dimensions.d4Contato >= 10
          ? "Contato direto disponivel para abordagem imediata."
          : "Dados de contato incompletos para resposta rapida.",
    },
    {
      id: "etapas",
      label: "Etapas de ensino",
      max_points: 15,
      points: computedIcp.dimensions.d5Etapas,
      school_value: etapasText || "Nao informado",
      analysis:
        computedIcp.dimensions.d5Etapas >= 12
          ? "Combinacao de etapas favorece ICP comercial."
          : "Oferta de etapas com menor encaixe no ICP alvo.",
    },
  ];

  return NextResponse.json(profile);
}
