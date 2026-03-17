import { NextRequest, NextResponse } from "next/server";

import type { ICPMatch, SchoolLead, SchoolSegment } from "@/lib/types";

type OpenCnpjRow = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  logradouro?: string;
  bairro?: string;
  ddd_telefone_1?: string;
  telefone_1?: string;
  telefone?: string;
  email?: string;
  data_inicio_atividade?: string;
  capital_social?: number | string;
  porte?: string;
  cnae_fiscal?: string;
  cnae_fiscal_descricao?: string;
  situacao_cadastral?: string;
  website?: string;
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

function parseCapitalSocial(value: unknown): number {
  const text = String(value ?? "").replace(/\./g, "").replace(",", ".");
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function yearsSince(dateText: unknown): number {
  const parsed = new Date(String(dateText ?? ""));
  if (Number.isNaN(parsed.getTime())) return 0;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25)));
}

function isEducationalCnae(cnae: string): boolean {
  return cnae.startsWith("85");
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
      return isEducationalCnae(cnae) ? "ed. basica" : "indefinido";
  }
}

function scoreHeuristic(row: OpenCnpjRow, requestedCnae: string): { score: number; icp: ICPMatch } {
  let score = 0;

  const capital = parseCapitalSocial(row.capital_social);
  if (capital >= 500000) score += 20;
  else if (capital >= 200000) score += 15;
  else if (capital >= 50000) score += 10;

  const porte = String(row.porte ?? "").toUpperCase();
  if (porte.includes("EPP")) score += 12;
  else if (porte.includes("ME")) score += 8;
  else score += 5;

  const cnae = normalizeDigits(row.cnae_fiscal);
  if (cnae === requestedCnae) score += 20;
  else if (isEducationalCnae(cnae)) score += 10;

  const years = yearsSince(row.data_inicio_atividade);
  if (years > 15) score += 10;
  else if (years >= 5) score += 15;
  else if (years >= 3) score += 8;
  else score += 3;

  if (String(row.website ?? "").trim()) score += 10;
  const phone = String(row.telefone ?? row.telefone_1 ?? "").trim();
  if (phone) score += 10;

  const icp: ICPMatch = score >= 60 ? "alto" : score >= 35 ? "medio" : "baixo";
  return { score, icp };
}

async function fetchCep(cep: string): Promise<CepResponse | null> {
  const cleanCep = normalizeDigits(cep);
  if (cleanCep.length !== 8) return null;

  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`, {
      cache: "no-store",
    });
    if (!resp.ok) return null;
    return (await resp.json()) as CepResponse;
  } catch {
    return null;
  }
}

function toPhoneFormatted(raw: string): string | null {
  const digits = normalizeDigits(raw);
  if (!digits) return null;
  if (digits.startsWith("55")) return `+${digits}`;
  return `+55${digits}`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { cidade?: string; cnae?: string };
  const cidade = String(body.cidade ?? "").trim();
  const cnae = normalizeDigits(body.cnae);

  if (!cidade || !cnae) {
    return NextResponse.json({ error: "cidade e cnae são obrigatórios" }, { status: 400 });
  }

  const url = `https://api.opencnpj.org/busca?municipio=${encodeURIComponent(cidade)}&cnae=${encodeURIComponent(cnae)}&situacao=Ativa&limit=50`;

  const opencnpjResp = await fetch(url, { cache: "no-store" });
  if (!opencnpjResp.ok) {
    const text = await opencnpjResp.text();
    return NextResponse.json({ error: `OpenCNPJ error: ${text.slice(0, 300)}` }, { status: opencnpjResp.status });
  }

  const raw = (await opencnpjResp.json()) as unknown;
  const rows: OpenCnpjRow[] = Array.isArray(raw)
    ? (raw as OpenCnpjRow[])
    : Array.isArray((raw as { resultados?: unknown[] }).resultados)
      ? (((raw as { resultados?: unknown[] }).resultados ?? []) as OpenCnpjRow[])
      : [];

  const now = new Date().toISOString();
  const leads: SchoolLead[] = [];

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const score = scoreHeuristic(row, cnae);
    const cep = normalizeDigits(row.cep);
    const cepData = cep ? await fetchCep(cep) : null;

    const phoneRaw = String(row.telefone ?? row.telefone_1 ?? "");
    const phoneFormatted = toPhoneFormatted(phoneRaw);

    leads.push({
      id: `tmp-${idx}-${normalizeDigits(row.cnpj) || "no-cnpj"}`,
      name: String(row.nome_fantasia ?? row.razao_social ?? "Escola"),
      place_type: "school",
      school_segment: cnaeToSegment(cnae),
      is_private: "Sim",
      phone_number: phoneRaw || null,
      phone_formatted: phoneFormatted,
      whatsapp_ready: phoneFormatted ? "Sim" : "Nao",
      website: row.website ? String(row.website) : null,
      email: row.email ? String(row.email) : null,
      address: row.logradouro ? String(row.logradouro) : null,
      bairro: row.bairro ? String(row.bairro) : cepData?.neighborhood ?? null,
      city: row.municipio ? String(row.municipio) : cepData?.city ?? cidade,
      state: row.uf ? String(row.uf) : cepData?.state ?? null,
      cep: cep || null,
      latitude: cepData?.location?.coordinates?.latitude ? Number(cepData.location.coordinates.latitude) : null,
      longitude: cepData?.location?.coordinates?.longitude ? Number(cepData.location.coordinates.longitude) : null,
      cep_lat: cepData?.location?.coordinates?.latitude ? Number(cepData.location.coordinates.latitude) : null,
      cep_lng: cepData?.location?.coordinates?.longitude ? Number(cepData.location.coordinates.longitude) : null,
      reviews_count: null,
      reviews_average: null,
      opens_at: null,
      place_id: normalizeDigits(row.cnpj) || null,
      maps_url: null,
      cnpj: normalizeDigits(row.cnpj) || null,
      razao_social: row.razao_social ? String(row.razao_social) : null,
      situacao_cadastral: row.situacao_cadastral ? String(row.situacao_cadastral) : "Ativa",
      data_abertura: row.data_inicio_atividade ? String(row.data_inicio_atividade) : null,
      capital_social: parseCapitalSocial(row.capital_social) || null,
      porte: row.porte?.toUpperCase().includes("EPP") ? "EPP" : row.porte?.toUpperCase().includes("ME") ? "ME" : "Demais",
      cnae_descricao: row.cnae_fiscal_descricao ? String(row.cnae_fiscal_descricao) : null,
      inep_code: null,
      total_matriculas: null,
      ideb_af: null,
      ai_score: score.score,
      icp_match: score.icp,
      pain_points: null,
      abordagem_sugerida: "Abordar com proposta de automação comercial e melhoria de captação.",
      prioridade: score.score >= 60 ? "imediata" : score.score >= 35 ? "normal" : "baixa",
      justificativa_score: `Score local heurístico (${score.score} pontos).`,
      pipeline_stage: "Novo",
      owner: null,
      notes: null,
      next_action: null,
      source: "opencnpj_search",
      data_quality: 70,
      scraped_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  return NextResponse.json(leads);
}
