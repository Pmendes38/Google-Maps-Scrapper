import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { ICPMatch } from "@/lib/types";

type BrasilApiCnpj = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  ddd_telefone_1?: string;
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

function parseNumber(value: unknown): number {
  const text = String(value ?? "").replace(/\./g, "").replace(",", ".");
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function yearsSince(dateText: unknown): number {
  const d = new Date(String(dateText ?? ""));
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25)));
}

async function fetchBrasilApiCnpj(cnpj: string): Promise<BrasilApiCnpj | null> {
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { cache: "no-store" });
    if (!resp.ok) return null;
    return (await resp.json()) as BrasilApiCnpj;
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

function calcLeadScore(input: {
  capitalSocial: number;
  porte: string;
  years: number;
  hasPhone: boolean;
  hasEmail: boolean;
  hasInternet: boolean;
  hasLab: boolean;
  totalMats: number;
}): { score: number; icp: ICPMatch } {
  let score = 0;

  if (input.capitalSocial >= 500000) score += 20;
  else if (input.capitalSocial >= 200000) score += 15;
  else if (input.capitalSocial >= 50000) score += 10;

  if (input.porte.includes("EPP")) score += 12;
  else if (input.porte.includes("ME")) score += 8;
  else score += 5;

  if (input.years > 15) score += 10;
  else if (input.years >= 5) score += 15;
  else if (input.years >= 3) score += 8;
  else score += 3;

  if (input.hasPhone) score += 10;
  if (input.hasEmail) score += 8;
  if (input.hasInternet) score += 8;
  if (input.hasLab) score += 6;
  if (input.totalMats >= 300) score += 10;
  else if (input.totalMats >= 100) score += 6;

  const icp: ICPMatch = score >= 60 ? "alto" : score >= 35 ? "medio" : "baixo";
  return { score, icp };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }

  const inepCode = String(params.id ?? "").trim();
  if (!inepCode) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const { data: inep, error } = await supabase
    .from("inep_schools")
    .select("*")
    .eq("co_entidade", inepCode)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!inep) {
    return NextResponse.json({ error: "Escola não encontrada na base INEP" }, { status: 404 });
  }

  const cnpj = normalizeDigits(inep.cnpj);
  const cnpjData = cnpj.length === 14 ? await fetchBrasilApiCnpj(cnpj) : null;
  const cepData = await fetchCep(normalizeDigits(cnpjData?.cep));

  const rawPhone = `${cnpjData?.ddd_telefone_1 ?? ""}${cnpjData?.ddd_telefone_2 ?? ""}`;
  const phoneDigits = normalizeDigits(rawPhone);

  const scoreData = calcLeadScore({
    capitalSocial: parseNumber(cnpjData?.capital_social),
    porte: String(cnpjData?.porte ?? "").toUpperCase(),
    years: yearsSince(cnpjData?.data_inicio_atividade),
    hasPhone: Boolean(phoneDigits),
    hasEmail: Boolean(cnpjData?.email),
    hasInternet: Boolean(inep.in_internet),
    hasLab: Boolean(inep.in_lab_informatica),
    totalMats: Number(inep.qt_mat_bas ?? 0),
  });

  const payload = {
    inep_code: inep.co_entidade,
    name: cnpjData?.nome_fantasia ?? cnpjData?.razao_social ?? inep.no_entidade,
    city: cnpjData?.municipio ?? inep.no_municipio,
    state: cnpjData?.uf ?? inep.sg_uf,
    cnpj: cnpj || null,
    razao_social: cnpjData?.razao_social ?? null,
    capital_social: parseNumber(cnpjData?.capital_social) || null,
    porte: cnpjData?.porte ?? null,
    cnae_descricao: cnpjData?.cnae_fiscal_descricao ?? null,
    data_abertura: cnpjData?.data_inicio_atividade ?? null,
    email: cnpjData?.email ?? null,
    phone_number: phoneDigits || null,
    phone_formatted: phoneDigits ? `+55${phoneDigits}` : null,
    address: cnpjData?.logradouro ?? null,
    bairro: cnpjData?.bairro ?? cepData?.neighborhood ?? null,
    cep: normalizeDigits(cnpjData?.cep) || null,
    latitude: cepData?.location?.coordinates?.latitude ? Number(cepData.location.coordinates.latitude) : null,
    longitude: cepData?.location?.coordinates?.longitude ? Number(cepData.location.coordinates.longitude) : null,
    total_matriculas: Number(inep.qt_mat_bas ?? 0),
    matriculas_infantil: Number(inep.qt_mat_inf ?? 0),
    matriculas_fundamental: Number(inep.qt_mat_fund ?? 0),
    matriculas_medio: Number(inep.qt_mat_med ?? 0),
    ideb_ai: inep.nu_ideb_ai,
    ideb_af: inep.nu_ideb_af,
    tem_internet: Boolean(inep.in_internet),
    tem_lab_informatica: Boolean(inep.in_lab_informatica),
    ai_score: scoreData.score,
    icp_match: scoreData.icp,
    justificativa_score: "Score local calculado com base em INEP + BrasilAPI.",
  };

  return NextResponse.json(payload);
}
