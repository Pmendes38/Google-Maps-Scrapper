import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { ICPMatch, SchoolLead, SchoolSegment } from "@/lib/types";

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
  municipio?: string;
  uf?: string;
  logradouro?: string;
  bairro?: string;
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

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  let text = raw;
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  if (hasDot && hasComma) {
    // pt-BR style: 50.000,00 -> 50000.00
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    text = /,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (hasDot && !/\.\d{1,2}$/.test(text)) {
    text = text.replace(/\./g, "");
  }

  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function yearsSince(dateText: unknown): number {
  const d = new Date(String(dateText ?? ""));
  if (Number.isNaN(d.getTime())) return 0;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)));
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
  return parseNumber(data?.capital_social);
}

function extractPorte(data: CompanyData | null): string {
  const porteRaw = data?.porte ?? data?.descricao_porte ?? "NAO INFORMADO";
  return normalizeText(porteRaw);
}

function extractDataAbertura(data: CompanyData | null): string | null {
  const value = String(data?.data_inicio_atividade ?? "").trim();
  return value || null;
}

function extractCnaeFiscal(data: CompanyData | null): string {
  return normalizeDigits(data?.cnae_fiscal);
}

function extractPhoneDigits(data: CompanyData | null): string {
  const dddPhone = normalizeDigits(data?.ddd_telefone_1);
  if (dddPhone.length >= 8) {
    return dddPhone;
  }
  const composed = `${data?.ddd_telefone_1 ?? ""}${data?.telefone_1 ?? ""}`;
  const digits = normalizeDigits(composed);
  return digits;
}

function extractWebsite(data: CompanyData | null): string | null {
  const candidates = [
    data?.website,
    data?.site,
    data?.url,
    data?.dominio,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const found = candidates.find((value) => value.includes("http") || value.includes("www."));
  return found || null;
}

function getPorteScore(porte: string): number {
  if (porte === "ME" || porte.includes("MICRO EMPRESA")) return 10;
  if (porte === "EPP" || porte.includes("EMPRESA DE PEQUENO PORTE")) return 15;
  if (porte === "DEMAIS") return 20;
  if (porte.includes("NAO INFORMADO")) return 2;
  return 2;
}

function getCapitalSocialScore(capital: number): number {
  if (capital >= 500000) return 25;
  if (capital >= 200000) return 18;
  if (capital >= 50000) return 12;
  if (capital >= 1) return 5;
  return 2;
}

function getYearsScore(years: number): number {
  if (years < 0) return 2;
  if (years < 2) return 3;
  if (years < 5) return 8;
  if (years <= 15) return 15;
  return 10;
}

function getCnaeScore(companyCnae: string, requestedCnae: string): number {
  if (companyCnae && companyCnae === requestedCnae) return 25;
  if (companyCnae.startsWith("85")) return 12;
  return 0;
}

function scoreHeuristic(data: CompanyData | null, requestedCnae: string): { score: number; icp: ICPMatch } {
  let score = 0;

  const capital = extractCapitalSocial(data);
  score += getCapitalSocialScore(capital);

  const porte = extractPorte(data);
  score += getPorteScore(porte);

  const cnae = extractCnaeFiscal(data);
  score += getCnaeScore(cnae, requestedCnae);

  const abertura = extractDataAbertura(data);
  const years = abertura ? yearsSince(abertura) : -1;
  score += getYearsScore(years);

  const phone = extractPhoneDigits(data);
  if (phone) score += 15;

  const icp: ICPMatch = score >= 65 ? "alto" : score >= 40 ? "medio" : "baixo";
  return { score, icp };
}

function suggestedApproach(score: number): string {
  if (score >= 65) {
    return "Escola com porte e estrutura para investir em processo comercial. Abordagem direta ao diretor sobre captação de alunos.";
  }
  if (score >= 40) {
    return "Escola em crescimento com potencial. Apresentar case de resultado e proposta de diagnóstico gratuito.";
  }
  return "Escola menor ou com dados incompletos. Qualificar por telefone antes de proposta formal.";
}

function isPrivateFromTpRede(tpRede: number | null): "Sim" | "Nao" | "Indefinido" {
  if (tpRede === 4) return "Sim";
  if (tpRede === 1 || tpRede === 2 || tpRede === 3) return "Nao";
  return "Indefinido";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapPorteToLead(porte: string): "ME" | "EPP" | "Demais" | null {
  if (porte === "ME" || porte.includes("MICRO EMPRESA")) return "ME";
  if (porte === "EPP" || porte.includes("EMPRESA DE PEQUENO PORTE")) return "EPP";
  if (porte === "DEMAIS") return "Demais";
  return null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { cidade?: string; estado?: string; cnae?: string };
  const cidade = String(body.cidade ?? "").trim();
  const estado = String(body.estado ?? "").trim().toUpperCase();
  const cnae = normalizeDigits(body.cnae);

  if (!cidade || !estado || !cnae) {
    return NextResponse.json({ error: "estado, cidade e cnae são obrigatórios" }, { status: 400 });
  }

  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }

  // Fonte primária: Censo INEP carregado em inep_schools.
  const { data, error } = await supabase
    .from("inep_schools")
    .select("*")
    .eq("sg_uf", estado)
    .ilike("no_municipio", `%${cidade}%`)
    .limit(300);

  if (error) {
    return NextResponse.json({ error: `Falha ao consultar INEP: ${error.message}` }, { status: 500 });
  }

  const inepRows = ((data ?? []) as IneqRow[]).filter((row) => matchesSegment(row, cnae));
  if (inepRows.length === 0) {
    return NextResponse.json([]);
  }

  const now = new Date().toISOString();

  const leads = await Promise.all(
    inepRows.slice(0, 80).map(async (row, index) => {
      await delay(index * 100);

      const cnpj = normalizeDigits(row.cnpj);
      const cnpjData = cnpj.length === 14 ? await fetchBrasilApiCnpj(cnpj) : null;
      const cep = normalizeDigits(cnpjData?.cep);
      const cepData = await fetchCep(cep);
      const score = scoreHeuristic(cnpjData, cnae);

      const phoneDigits = extractPhoneDigits(cnpjData);
      const phoneFormatted = phoneDigits ? `+55${phoneDigits}` : null;
      const website = extractWebsite(cnpjData);
      const abertura = extractDataAbertura(cnpjData);

      const lead: SchoolLead = {
        id: String(row.co_entidade),
        name: String(cnpjData?.nome_fantasia ?? cnpjData?.razao_social ?? row.no_entidade ?? "Escola"),
        place_type: "school",
        school_segment: cnaeToSegment(cnae),
        is_private: isPrivateFromTpRede(row.tp_rede),
        phone_number: phoneDigits || null,
        phone_formatted: phoneFormatted,
        whatsapp_ready: phoneFormatted ? "Sim" : "Nao",
        website,
        email: cnpjData?.email ?? null,
        address: cnpjData?.logradouro ?? null,
        bairro: cnpjData?.bairro ?? cepData?.neighborhood ?? null,
        city: cnpjData?.municipio ?? row.no_municipio ?? cepData?.city ?? cidade,
        state: cnpjData?.uf ?? row.sg_uf ?? cepData?.state ?? estado,
        cep: cep || null,
        latitude: cepData?.location?.coordinates?.latitude ? Number(cepData.location.coordinates.latitude) : null,
        longitude: cepData?.location?.coordinates?.longitude ? Number(cepData.location.coordinates.longitude) : null,
        cep_lat: cepData?.location?.coordinates?.latitude ? Number(cepData.location.coordinates.latitude) : null,
        cep_lng: cepData?.location?.coordinates?.longitude ? Number(cepData.location.coordinates.longitude) : null,
        reviews_count: null,
        reviews_average: null,
        opens_at: null,
        place_id: cnpj || row.co_entidade,
        maps_url: null,
        cnpj: cnpj || null,
        razao_social: cnpjData?.razao_social ?? row.no_entidade ?? null,
        situacao_cadastral: cnpjData?.descricao_situacao_cadastral ?? "Ativa",
        data_abertura: abertura,
        capital_social: extractCapitalSocial(cnpjData) || null,
        porte: mapPorteToLead(extractPorte(cnpjData)),
        cnae_descricao: cnpjData?.cnae_fiscal_descricao ?? null,
        inep_code: row.co_entidade,
        total_matriculas: row.qt_mat_bas,
        ideb_af: row.nu_ideb_af,
        ai_score: score.score,
        icp_match: score.icp,
        pain_points: null,
        abordagem_sugerida: suggestedApproach(score.score),
        prioridade: score.score >= 60 ? "imediata" : score.score >= 35 ? "normal" : "baixa",
        justificativa_score: `Score heurístico com base no INEP + BrasilAPI (${score.score} pts).`,
        pipeline_stage: "Novo",
        owner: null,
        notes: null,
        next_action: null,
        source: "inep_censo",
        data_quality: 75,
        scraped_at: now,
        created_at: now,
        updated_at: now,
      };

      return lead;
    }),
  );

  leads.sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));
  return NextResponse.json(leads);
}
