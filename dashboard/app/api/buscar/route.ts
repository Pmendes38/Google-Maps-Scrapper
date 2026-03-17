import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";
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

function normalizeCity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function segmentForRequestedCnae(cnae: string): SchoolSegment {
  return cnaeToSegment(cnae);
}

function mapDbLeadToSearchLead(row: Partial<SchoolLead>, idx: number): SchoolLead {
  const now = new Date().toISOString();
  return {
    id: row.id ?? `db-${idx}`,
    name: row.name ?? "Escola",
    place_type: row.place_type ?? "school",
    school_segment: (row.school_segment ?? "indefinido") as SchoolSegment,
    is_private: row.is_private ?? "Sim",
    phone_number: row.phone_number ?? null,
    phone_formatted: row.phone_formatted ?? null,
    whatsapp_ready: row.whatsapp_ready ?? "Nao",
    website: row.website ?? null,
    email: row.email ?? null,
    address: row.address ?? null,
    bairro: row.bairro ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    cep: row.cep ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    cep_lat: row.cep_lat ?? null,
    cep_lng: row.cep_lng ?? null,
    reviews_count: row.reviews_count ?? null,
    reviews_average: row.reviews_average ?? null,
    opens_at: row.opens_at ?? null,
    place_id: row.place_id ?? null,
    maps_url: row.maps_url ?? null,
    cnpj: row.cnpj ?? null,
    razao_social: row.razao_social ?? null,
    situacao_cadastral: row.situacao_cadastral ?? null,
    data_abertura: row.data_abertura ?? null,
    capital_social: row.capital_social ?? null,
    porte: row.porte ?? null,
    cnae_descricao: row.cnae_descricao ?? null,
    inep_code: row.inep_code ?? null,
    total_matriculas: row.total_matriculas ?? null,
    ideb_af: row.ideb_af ?? null,
    ai_score: row.ai_score ?? null,
    icp_match: row.icp_match ?? null,
    pain_points: row.pain_points ?? null,
    abordagem_sugerida: row.abordagem_sugerida ?? null,
    prioridade: row.prioridade ?? null,
    justificativa_score: row.justificativa_score ?? null,
    pipeline_stage: row.pipeline_stage ?? "Novo",
    owner: row.owner ?? null,
    notes: row.notes ?? null,
    next_action: row.next_action ?? null,
    source: row.source ?? "supabase_fallback",
    data_quality: row.data_quality ?? null,
    scraped_at: row.scraped_at ?? null,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  };
}

async function fetchOpenCnpj(cidade: string, cnae: string, estado?: string): Promise<OpenCnpjRow[] | null> {
  const base = (process.env.OPENCNPJ_BASE_URL ?? "https://api.opencnpj.org").replace(/\/$/, "");
  const apiKey = process.env.OPENCNPJ_API_KEY?.trim();
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }

  const cityVariants = Array.from(new Set([cidade, normalizeCity(cidade)]));
  const endpoints = [
    `${base}/busca`,
    `${base}/v1/busca`,
  ];

  for (const endpoint of endpoints) {
    for (const city of cityVariants) {
      const url = `${endpoint}?municipio=${encodeURIComponent(city)}&cnae=${encodeURIComponent(cnae)}&situacao=Ativa&limit=50${estado ? `&uf=${encodeURIComponent(estado)}` : ""}`;
      try {
        const resp = await fetch(url, { cache: "no-store", headers });
        if (!resp.ok) continue;
        const raw = (await resp.json()) as unknown;
        if (Array.isArray(raw)) return raw as OpenCnpjRow[];
        if (Array.isArray((raw as { resultados?: unknown[] }).resultados)) {
          return ((raw as { resultados?: unknown[] }).resultados ?? []) as OpenCnpjRow[];
        }
      } catch {
        // try next variant
      }
    }
  }
  return null;
}

function toPhoneFormatted(raw: string): string | null {
  const digits = normalizeDigits(raw);
  if (!digits) return null;
  if (digits.startsWith("55")) return `+${digits}`;
  return `+55${digits}`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { cidade?: string; estado?: string; cnae?: string };
  const cidade = String(body.cidade ?? "").trim();
  const estado = String(body.estado ?? "").trim().toUpperCase();
  const cnae = normalizeDigits(body.cnae);

  if (!cidade || !cnae) {
    return NextResponse.json({ error: "cidade e cnae são obrigatórios" }, { status: 400 });
  }

  const rows = (await fetchOpenCnpj(cidade, cnae, estado)) ?? [];

  // Fallback resiliente: se OpenCNPJ indisponível, retorna resultados já existentes no Supabase.
  if (rows.length === 0) {
    const { supabase } = getServerSupabaseClient();
    if (supabase) {
      const requestedSegment = segmentForRequestedCnae(cnae);
      const cityNormalized = normalizeCity(cidade);

      let query = supabase
        .from("school_leads")
        .select("*")
        .eq("is_private", "Sim")
        .order("ai_score", { ascending: false, nullsFirst: false })
        .limit(50);

      if (estado) {
        query = query.eq("state", estado);
      }

      // Tenta cidade normal e sem acento para bases heterogêneas.
      query = query.or(`city.ilike.%${cidade}%,city.ilike.%${cityNormalized}%`);

      const { data } = await query;

      const filtered = (data ?? []).filter((lead) => {
        const leadSegment = String(lead.school_segment ?? "").toLowerCase();
        const expectedSegment = requestedSegment.toLowerCase();
        return leadSegment === expectedSegment || leadSegment.includes("ensino") || leadSegment.includes("educacao");
      });

      return NextResponse.json(filtered.map((lead, idx) => mapDbLeadToSearchLead(lead as Partial<SchoolLead>, idx)));
    }

    return NextResponse.json([]);
  }

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
      state: row.uf ? String(row.uf) : cepData?.state ?? (estado || null),
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
