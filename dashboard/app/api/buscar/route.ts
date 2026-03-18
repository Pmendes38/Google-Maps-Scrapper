import { NextRequest, NextResponse } from "next/server";

import { computeIcpFitScore } from "@/lib/icp-scoring";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { SchoolLead, SchoolSegment } from "@/lib/types";

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
  no_municipio: string | null;
  sg_uf: string | null;
};

type CompanyData = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  numero?: string;
  ddd_telefone_1?: string;
  telefone_1?: string;
  descricao_porte?: string;
  descricao_situacao_cadastral?: string;
  situacao_cadastral?: string;
  website?: string;
  site?: string;
  url?: string;
  dominio?: string;
  descricao_tipo_logradouro?: string;
  ddd_telefone_2?: string;
  email?: string;
  porte?: string;
  capital_social?: string | number;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  data_inicio_atividade?: string;
  abertura?: string;
  municipio?: string;
  uf?: string;
  logradouro?: string;
  bairro?: string;
  telefones?: Array<{ ddd?: string | number; numero?: string | number; is_fax?: boolean }>;
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

type MinhaReceitaPage = {
  data?: CompanyData[];
  cursor?: string | null;
};

type CandidateLead = {
  inepRow: IneqRow | null;
  seedCompany: CompanyData | null;
  sourceDiscovery: "inep" | "minha_receita" | "cnpjws";
};

type QEduProfileRow = {
  inep_code: string | null;
  qtd_matriculas: number | null;
};

type AdministrativeFilter = "todas" | "privada" | "publica" | "federal" | "estadual" | "municipal";

const DISCOVERY_PROVIDER = (process.env.DISCOVERY_PROVIDER ?? "inep_minha_receita").toLowerCase();
const MIN_INEP_RESULTS = 30;
const MAX_SEARCH_RESULTS = 80;
const MAX_FALLBACK_PAGES = 5;

function escapeIlikeValue(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeText(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const fixed = raw.includes("Ã") || raw.includes("Â") ? Buffer.from(raw, "latin1").toString("utf8") : raw;

  return fixed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim()
    .toUpperCase();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[b.length];
}

function sameCity(left: unknown, right: unknown): boolean {
  const leftNormalized = normalizeText(left);
  const rightNormalized = normalizeText(right);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;
  if (leftNormalized.startsWith(rightNormalized) || rightNormalized.startsWith(leftNormalized)) return true;
  if (leftNormalized.slice(0, 4) !== rightNormalized.slice(0, 4)) return false;
  return levenshteinDistance(leftNormalized, rightNormalized) <= 2;
}

function sameState(left: unknown, right: unknown): boolean {
  const leftNormalized = normalizeText(left);
  const rightNormalized = normalizeText(right);
  return Boolean(leftNormalized) && leftNormalized === rightNormalized;
}

function normalizeAdministrativeFilter(value: unknown): AdministrativeFilter {
  const normalized = normalizeText(value);
  switch (normalized) {
    case "PRIVADA":
      return "privada";
    case "PUBLICA":
      return "publica";
    case "FEDERAL":
      return "federal";
    case "ESTADUAL":
      return "estadual";
    case "MUNICIPAL":
      return "municipal";
    default:
      return "todas";
  }
}

function tpRedeToAdministrativeType(tpRede: number | null): string {
  if (tpRede === 1) return "Federal";
  if (tpRede === 2) return "Estadual";
  if (tpRede === 3) return "Municipal";
  if (tpRede === 4) return "Privada";
  return "Nao informado";
}

function matchesAdministrativeFilter(tpRede: number | null, filter: AdministrativeFilter): boolean {
  if (filter === "todas") return true;
  if (filter === "privada") return tpRede === 4;
  if (filter === "publica") return tpRede === 1 || tpRede === 2 || tpRede === 3;
  if (filter === "federal") return tpRede === 1;
  if (filter === "estadual") return tpRede === 2;
  if (filter === "municipal") return tpRede === 3;
  return true;
}

function buildCitySearchTerms(city: string): string[] {
  const raw = String(city ?? "").trim();
  if (!raw) return [];

  const normalized = normalizeText(raw);
  const terms = new Set<string>([raw, normalized]);
  return Array.from(terms).filter(Boolean);
}

function cnaeToSegment(cnae: string): SchoolSegment {
  switch (cnae) {
    case "8513900":
      return "ensino fundamental";
    case "8520100":
      return "ensino medio";
    case "8512100":
      return "educacao infantil";
    case "8511200":
      return "creche/bercario";
    case "8541400":
      return "ensino tecnico";
    case "8593700":
      return "idiomas/bilingue";
    default:
      return "ed. basica";
  }
}

function matchesSegment(row: IneqRow, cnae: string): boolean {
  switch (cnae) {
    case "8513900":
      return Number(row.qt_mat_fund ?? 0) > 0;
    case "8520100":
      return Number(row.qt_mat_med ?? 0) > 0;
    case "8512100":
    case "8511200":
      return Number(row.qt_mat_inf ?? 0) > 0;
    case "8541400":
      return Number(row.qt_mat_med ?? 0) > 0;
    case "8593700":
      return Number(row.qt_mat_bas ?? 0) > 0;
    default:
      return Number(row.qt_mat_bas ?? 0) > 0;
  }
}

async function fetchBrasilApiCnpj(cnpj: string): Promise<CompanyData | null> {
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { cache: "no-store" });
    if (!resp.ok) return null;
    return (await resp.json()) as CompanyData;
  } catch {
    return null;
  }
}

async function fetchOpenCnpj(cnpj: string): Promise<CompanyData | null> {
  try {
    const resp = await fetch(`https://api.opencnpj.org/${cnpj}`, { cache: "no-store" });
    if (!resp.ok) return null;
    return (await resp.json()) as CompanyData;
  } catch {
    return null;
  }
}

async function fetchCep(cep: string): Promise<CepResponse | null> {
  const clean = normalizeDigits(cep);
  if (clean.length !== 8) return null;
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`, { cache: "no-store" });
    if (!resp.ok) return null;
    return (await resp.json()) as CepResponse;
  } catch {
    return null;
  }
}

function extractCapitalSocial(data: CompanyData | null): number {
  const raw = String(data?.capital_social ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function extractPorte(data: CompanyData | null): string {
  const porteRaw = data?.porte ?? data?.descricao_porte ?? "NAO INFORMADO";
  return normalizeText(porteRaw);
}

function extractDataAbertura(data: CompanyData | null): string | null {
  const value = String(data?.data_inicio_atividade ?? data?.abertura ?? "").trim();
  return value || null;
}

function extractPhoneDigits(data: CompanyData | null): string {
  const dddPhone = normalizeDigits(data?.ddd_telefone_1);
  if (dddPhone.length >= 8) {
    return dddPhone;
  }
  const composed = `${data?.ddd_telefone_1 ?? ""}${data?.telefone_1 ?? ""}`;
  const composedDigits = normalizeDigits(composed);
  if (composedDigits.length >= 8) {
    return composedDigits;
  }

  if (Array.isArray(data?.telefones)) {
    const entry = data.telefones.find((phone) => phone && phone.is_fax !== true) ?? data.telefones[0];
    if (entry) {
      const fromArray = normalizeDigits(`${entry.ddd ?? ""}${entry.numero ?? ""}`);
      if (fromArray.length >= 8) {
        return fromArray;
      }
    }
  }

  return "";
}

function extractWebsite(data: CompanyData | null): string | null {
  const candidates = [data?.website, data?.site, data?.url, data?.dominio]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const found = candidates.find((value) => value.length > 3);
  if (!found) return null;
  if (found.startsWith("http://") || found.startsWith("https://")) return found;
  if (found.includes(".")) return `https://${found.replace(/^www\./, "www.")}`;
  return null;
}

function isPrivateFromTpRede(tpRede: number | null): "Sim" | "Nao" | "Indefinido" {
  if (tpRede === 4) return "Sim";
  if (tpRede === 1 || tpRede === 2 || tpRede === 3) return "Nao";
  return "Indefinido";
}

function mapPorteToLead(porte: string): "ME" | "EPP" | "Demais" | null {
  if (porte === "ME" || porte.includes("MICRO EMPRESA")) return "ME";
  if (porte === "EPP" || porte.includes("EMPRESA DE PEQUENO PORTE")) return "EPP";
  if (porte === "DEMAIS") return "Demais";
  return null;
}

function normalizeInepMatriculas(total: number | null, inf: number | null, fund: number | null, med: number | null): number | null {
  const totalNum = Number(total ?? 0);
  const signals = [Number(inf ?? 0), Number(fund ?? 0), Number(med ?? 0)].filter((value) => value > 0);
  const isLikelyFlag = totalNum <= 1 && signals.length > 0 && signals.every((value) => value <= 1);
  if (isLikelyFlag) return null;
  if (!Number.isFinite(totalNum) || totalNum <= 0) return null;
  return totalNum;
}

function estimateMonthlyRevenue(
  totalMatriculas: number | null,
  porte: "ME" | "EPP" | "Demais" | null,
  capitalSocial: number | null,
  segment: SchoolSegment,
): number | null {
  if (totalMatriculas !== null && totalMatriculas > 0) {
    return totalMatriculas * 700;
  }

  if (porte === "Demais") return 280_000;
  if (porte === "EPP") return 140_000;
  if (porte === "ME") return 65_000;

  if (capitalSocial !== null && capitalSocial >= 1_000_000) return 260_000;
  if (capitalSocial !== null && capitalSocial >= 300_000) return 130_000;
  if (capitalSocial !== null && capitalSocial >= 100_000) return 80_000;
  if (capitalSocial !== null && capitalSocial >= 30_000) return 45_000;

  if (segment === "ensino medio") return 90_000;
  if (segment === "ensino fundamental") return 80_000;
  if (segment === "educacao infantil" || segment === "creche/bercario") return 55_000;
  if (segment === "idiomas/bilingue") return 75_000;
  return 50_000;
}

async function fetchMinhaReceitaPage(
  cidade: string,
  estado: string,
  cnae: string,
  cursor?: string,
): Promise<MinhaReceitaPage | null> {
  const params = new URLSearchParams({
    municipio: cidade,
    uf: estado,
    cnae_fiscal: cnae,
  });
  if (cursor) {
    params.set("cursor", cursor);
  }

  try {
    const response = await fetch(`https://minhareceita.org/?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as MinhaReceitaPage;
  } catch {
    return null;
  }
}

async function fetchMinhaReceitaDiscovery(cidade: string, estado: string, cnae: string): Promise<CompanyData[]> {
  const items: CompanyData[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_FALLBACK_PAGES; page += 1) {
    const payload = await fetchMinhaReceitaPage(cidade, estado, cnae, cursor);
    if (!payload?.data || payload.data.length === 0) {
      break;
    }
    items.push(...payload.data);
    cursor = payload.cursor ?? undefined;
    if (!cursor) break;
  }

  return items;
}

async function fetchCnpjWsDiscovery(cidade: string, estado: string, cnae: string): Promise<CompanyData[]> {
  const token = process.env.CNPJ_WS_TOKEN ?? "";
  const endpoint = process.env.CNPJWS_SEARCH_URL ?? "";
  if (!token || !endpoint) return [];

  const params = new URLSearchParams({
    municipio: cidade,
    uf: estado,
    cnae,
    limit: "100",
  });

  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return [];

    const json = (await response.json()) as { data?: CompanyData[] } | CompanyData[];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    return [];
  } catch {
    return [];
  }
}

async function resolveCompanyData(
  cnpj: string,
  seed: CompanyData | null,
  sourceDiscovery: CandidateLead["sourceDiscovery"],
): Promise<{ data: CompanyData | null; sourceCompany: SchoolLead["source_company"] }> {
  if (cnpj.length === 14) {
    const brasil = await fetchBrasilApiCnpj(cnpj);
    if (brasil) {
      return { data: brasil, sourceCompany: "brasilapi" };
    }
    const openCnpj = await fetchOpenCnpj(cnpj);
    if (openCnpj) {
      return { data: openCnpj, sourceCompany: "opencnpj" };
    }
  }

  if (seed) {
    if (sourceDiscovery === "minha_receita") {
      return { data: seed, sourceCompany: "minha_receita" };
    }
    if (sourceDiscovery === "cnpjws") {
      return { data: seed, sourceCompany: "cnpjws" };
    }
  }

  return { data: seed ?? null, sourceCompany: "none" };
}

async function createSourceSnapshot(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseClient>["supabase"]>,
  sourceName: string,
  cidade: string,
  estado: string,
  cnae: string,
  entities: CompanyData[],
) {
  if (entities.length === 0) return;

  try {
    const watermark = `${normalizeText(cidade)}:${estado}:${cnae}:${Date.now()}`;
    const startedAt = new Date().toISOString();
    const { data: snapshotRows, error: snapshotError } = await supabase
      .from("school_source_snapshots")
      .insert([
        {
          source_name: sourceName,
          source_version: "api_live",
          snapshot_mode: "incremental",
          watermark,
          status: "running",
          metadata: {
            cidade,
            estado,
            cnae,
            created_by: "dashboard_api_buscar",
          },
          started_at: startedAt,
        },
      ])
      .select("id")
      .limit(1);

    if (snapshotError || !snapshotRows || snapshotRows.length === 0) {
      return;
    }

    const snapshotId = snapshotRows[0].id as string;
    const snapshotItems = entities
      .map((entity) => {
        const cnpj = normalizeDigits(entity.cnpj);
        if (!cnpj) return null;
        return {
          snapshot_id: snapshotId,
          entity_type: "company",
          entity_id: cnpj,
          entity_hash: `${cnpj}:${normalizeText(entity.razao_social)}:${normalizeText(entity.municipio)}`,
          payload: entity,
        };
      })
      .filter(Boolean);

    if (snapshotItems.length > 0) {
      await supabase.from("school_source_snapshot_items").upsert(snapshotItems, {
        onConflict: "snapshot_id,entity_type,entity_id",
      });
    }

    await supabase
      .from("school_source_snapshots")
      .update({
        status: "completed",
        records_read: entities.length,
        records_changed: entities.length,
        records_upserted: 0,
        finished_at: new Date().toISOString(),
      })
      .eq("id", snapshotId);
  } catch {
    // Falhas de rastreabilidade nao podem quebrar o endpoint de busca.
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { cidade?: string; estado?: string; cnae?: string; dependencia?: string };
  const cidade = String(body.cidade ?? "").trim();
  const estado = String(body.estado ?? "").trim().toUpperCase();
  const cnae = normalizeDigits(body.cnae);
  const administrativeFilter = normalizeAdministrativeFilter(body.dependencia);

  if (!cidade || !estado || !cnae) {
    return NextResponse.json({ error: "estado, cidade e cnae sao obrigatorios" }, { status: 400 });
  }

  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }

  const cityTerms = buildCitySearchTerms(cidade);
  const cityLikeRoot = normalizeText(cidade).split(/\s+/).find(Boolean) ?? "";
  const cityLikeTerm = cityLikeRoot.length >= 3 ? cityLikeRoot.slice(0, 3) : String(cidade).trim();
  let inepQuery = supabase.from("inep_schools").select("*").eq("sg_uf", estado).limit(5000);

  if (cityLikeTerm) {
    inepQuery = inepQuery.ilike("no_municipio", `%${escapeIlikeValue(cityLikeTerm)}%`);
  }

  const { data, error } = await inepQuery;

  if (error) {
    return NextResponse.json({ error: `Falha ao consultar INEP: ${error.message}` }, { status: 500 });
  }

  const inepRows = ((data ?? []) as IneqRow[]).filter((row) => {
    return (
      matchesSegment(row, cnae) &&
      sameCity(row.no_municipio, cidade) &&
      matchesAdministrativeFilter(row.tp_rede, administrativeFilter)
    );
  });
  const candidatesByKey = new Map<string, CandidateLead>();
  const cnpjToInepRow = new Map<string, IneqRow>();

  for (const row of inepRows) {
    const cnpj = normalizeDigits(row.cnpj);
    if (cnpj.length === 14) {
      cnpjToInepRow.set(cnpj, row);
    }
    const key = cnpj.length === 14 ? `cnpj:${cnpj}` : `inep:${row.co_entidade}`;
    if (!candidatesByKey.has(key)) {
      candidatesByKey.set(key, {
        inepRow: row,
        seedCompany: null,
        sourceDiscovery: "inep",
      });
    }
  }

  let fallbackCompanies: CompanyData[] = [];
  let fallbackDiscovery: CandidateLead["sourceDiscovery"] = "minha_receita";
  const discoveryCity = normalizeText(cidade);
  const allowCorporateFallback = administrativeFilter === "todas" || administrativeFilter === "privada";

  if (allowCorporateFallback && inepRows.length < MIN_INEP_RESULTS) {
    if (DISCOVERY_PROVIDER === "inep_cnpjws") {
      fallbackDiscovery = "cnpjws";
      fallbackCompanies = await fetchCnpjWsDiscovery(discoveryCity, estado, cnae);
      if (fallbackCompanies.length === 0) {
        fallbackDiscovery = "minha_receita";
        fallbackCompanies = await fetchMinhaReceitaDiscovery(discoveryCity, estado, cnae);
      }
    } else {
      fallbackDiscovery = "minha_receita";
      fallbackCompanies = await fetchMinhaReceitaDiscovery(discoveryCity, estado, cnae);
    }
  }

  fallbackCompanies = fallbackCompanies.filter(
    (company) => sameCity(company.municipio, cidade) && sameState(company.uf, estado),
  );

  if (fallbackCompanies.length > 0) {
    await createSourceSnapshot(
      supabase,
      fallbackDiscovery === "cnpjws" ? "cnpj_ws_commercial" : "minha_receita_api",
      cidade,
      estado,
      cnae,
      fallbackCompanies,
    );
  }

  for (const company of fallbackCompanies) {
    const cnpj = normalizeDigits(company.cnpj);
    if (cnpj.length !== 14) continue;

    const key = `cnpj:${cnpj}`;
    if (candidatesByKey.has(key)) continue;

    const relatedInep = cnpjToInepRow.get(cnpj) ?? null;
    candidatesByKey.set(key, {
      inepRow: relatedInep,
      seedCompany: company,
      sourceDiscovery: fallbackDiscovery,
    });
  }

  if (candidatesByKey.size === 0) {
    return NextResponse.json([]);
  }

  const now = new Date().toISOString();
  const candidates = Array.from(candidatesByKey.values()).slice(0, MAX_SEARCH_RESULTS);
  const inepCodes = Array.from(
    new Set(
      candidates
        .map((candidate) => normalizeDigits(candidate.inepRow?.co_entidade))
        .filter((code) => code.length > 0),
    ),
  );
  const qeduMatriculasByInep = new Map<string, number>();

  if (inepCodes.length > 0) {
    const { data: qeduRows, error: qeduError } = await supabase
      .from("school_qedu_profiles")
      .select("inep_code,qtd_matriculas")
      .in("inep_code", inepCodes);

    if (!qeduError && Array.isArray(qeduRows)) {
      for (const row of qeduRows as QEduProfileRow[]) {
        const code = normalizeDigits(row.inep_code);
        const qty = Number(row.qtd_matriculas ?? 0);
        if (code && Number.isFinite(qty) && qty > 0) {
          qeduMatriculasByInep.set(code, qty);
        }
      }
    }
  }

  const leads = await Promise.all(
    candidates.map(async (candidate) => {
      const cnpj = normalizeDigits(candidate.inepRow?.cnpj ?? candidate.seedCompany?.cnpj);
      const { data: companyData, sourceCompany } = await resolveCompanyData(
        cnpj,
        candidate.seedCompany,
        candidate.sourceDiscovery,
      );
      const cep = normalizeDigits(companyData?.cep);
      const cepData = await fetchCep(cep);
      const phoneDigits = extractPhoneDigits(companyData);
      const phoneFormatted = phoneDigits ? `+55${phoneDigits}` : null;
      const website = extractWebsite(companyData);
      const abertura = extractDataAbertura(companyData);
      const segment = cnaeToSegment(cnae);
      const leadPorte = mapPorteToLead(extractPorte(companyData));
      const capitalSocial = extractCapitalSocial(companyData) || null;
      const inepCode = normalizeDigits(candidate.inepRow?.co_entidade);
      const qeduMatriculas = inepCode ? (qeduMatriculasByInep.get(inepCode) ?? null) : null;
      const normalizedInepMatriculas = normalizeInepMatriculas(
        candidate.inepRow?.qt_mat_bas ?? null,
        candidate.inepRow?.qt_mat_inf ?? null,
        candidate.inepRow?.qt_mat_fund ?? null,
        candidate.inepRow?.qt_mat_med ?? null,
      );
      const effectiveMatriculas = qeduMatriculas ?? normalizedInepMatriculas;
      const estimatedRevenue = estimateMonthlyRevenue(effectiveMatriculas, leadPorte, capitalSocial, segment);
      const leadIsPrivate =
        candidate.inepRow?.tp_rede !== null && candidate.inepRow?.tp_rede !== undefined
          ? isPrivateFromTpRede(candidate.inepRow.tp_rede)
          : candidate.sourceDiscovery === "inep"
            ? "Indefinido"
            : "Sim";
      const score = computeIcpFitScore({
        schoolSegment: segment,
        isPrivate: leadIsPrivate === "Sim",
        totalMatriculas: effectiveMatriculas,
        matriculasInfantil: candidate.inepRow?.qt_mat_inf ?? null,
        matriculasFundamental: candidate.inepRow?.qt_mat_fund ?? null,
        matriculasMedio: candidate.inepRow?.qt_mat_med ?? null,
        hasPhone: Boolean(phoneDigits),
        hasAddressOrWebsite: Boolean(companyData?.logradouro || website),
        estimatedRevenue,
      });

      const lead: SchoolLead = {
        id: String(candidate.inepRow?.co_entidade ?? cnpj ?? crypto.randomUUID()),
        name:
          String(
            companyData?.nome_fantasia ??
              companyData?.razao_social ??
              candidate.inepRow?.no_entidade ??
              "Escola",
          ) || "Escola",
        place_type: "school",
        school_segment: segment,
        is_private: leadIsPrivate,
        phone_number: phoneDigits || null,
        phone_formatted: phoneFormatted,
        whatsapp_ready: phoneFormatted ? "Sim" : "Nao",
        website,
        email: companyData?.email ?? null,
        address: companyData?.logradouro ?? null,
        bairro: companyData?.bairro ?? cepData?.neighborhood ?? null,
        city: candidate.inepRow?.no_municipio ?? companyData?.municipio ?? cepData?.city ?? cidade,
        state: candidate.inepRow?.sg_uf ?? companyData?.uf ?? cepData?.state ?? estado,
        cep: cep || null,
        latitude: cepData?.location?.coordinates?.latitude ? Number(cepData.location.coordinates.latitude) : null,
        longitude: cepData?.location?.coordinates?.longitude ? Number(cepData.location.coordinates.longitude) : null,
        cep_lat: cepData?.location?.coordinates?.latitude ? Number(cepData.location.coordinates.latitude) : null,
        cep_lng: cepData?.location?.coordinates?.longitude ? Number(cepData.location.coordinates.longitude) : null,
        reviews_count: null,
        reviews_average: null,
        opens_at: null,
        place_id: cnpj || candidate.inepRow?.co_entidade || null,
        maps_url: null,
        cnpj: cnpj || null,
        razao_social: companyData?.razao_social ?? candidate.inepRow?.no_entidade ?? null,
        situacao_cadastral: companyData?.descricao_situacao_cadastral ?? companyData?.situacao_cadastral ?? "Ativa",
        data_abertura: abertura,
        capital_social: capitalSocial,
        porte: leadPorte,
        cnae_descricao: companyData?.cnae_fiscal_descricao ?? null,
        inep_code: candidate.inepRow?.co_entidade ?? null,
        total_matriculas: effectiveMatriculas,
        ideb_af: candidate.inepRow?.nu_ideb_af ?? null,
        ai_score: score.score,
        icp_match: score.icpMatch,
        pain_points: score.painPoints,
        abordagem_sugerida: score.abordagem,
        prioridade: score.prioridade,
        justificativa_score: score.justificativa,
        pipeline_stage: "Novo",
        owner: null,
        notes: null,
        next_action: null,
        source: `${candidate.sourceDiscovery}_${sourceCompany}`,
        source_discovery: candidate.sourceDiscovery,
        source_company: sourceCompany,
        administrative_type: candidate.inepRow
          ? tpRedeToAdministrativeType(candidate.inepRow.tp_rede ?? null)
          : "Privada",
        data_quality: 78,
        scraped_at: now,
        created_at: now,
        updated_at: now,
      };

      return lead;
    }),
  );

  const deduped = new Map<string, SchoolLead>();
  for (const lead of leads) {
    if (!sameCity(lead.city, cidade) || !sameState(lead.state, estado)) {
      continue;
    }
    const cnpj = normalizeDigits(lead.cnpj);
    const key = cnpj.length === 14 ? `cnpj:${cnpj}` : `inep:${normalizeDigits(lead.inep_code) || lead.id}`;
    if (!deduped.has(key)) {
      deduped.set(key, lead);
    }
  }

  const sorted = Array.from(deduped.values()).sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));
  return NextResponse.json(sorted);
}
