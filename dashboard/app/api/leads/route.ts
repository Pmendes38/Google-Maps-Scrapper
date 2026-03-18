import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";

function toNullableString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text) return null;
  if (text.endsWith("%")) text = text.slice(0, -1).trim();

  const hasDot = text.includes(".");
  const hasComma = text.includes(",");
  if (hasDot && hasComma) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    text = /,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (hasDot && !/\.\d{1,2}$/.test(text)) {
    text = text.replace(/\./g, "");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const text = String(value).trim().toLowerCase();
  if (["true", "1", "sim", "s", "yes", "y"].includes(text)) return true;
  if (["false", "0", "nao", "não", "n", "no"].includes(text)) return false;
  return null;
}

function toPainPoints(value: unknown): string[] | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    const list = value.map((item) => String(item ?? "").trim()).filter(Boolean);
    return list.length > 0 ? list : null;
  }
  const text = String(value).trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      const list = parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
      return list.length > 0 ? list : null;
    }
  } catch {
    const list = text.split(/,|;|\|/).map((item) => item.trim()).filter(Boolean);
    return list.length > 0 ? list : null;
  }

  return null;
}

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function GET(request: NextRequest) {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }
  const params = request.nextUrl.searchParams;

  let query = supabase
    .from("school_leads")
    .select("*")
    .eq("is_private", "Sim")
    .order("ai_score", { ascending: false, nullsFirst: false });

  const state = params.get("state");
  const segment = params.get("segment");
  const icp = params.get("icp");
  const minScore = params.get("min_score");
  const whatsapp = params.get("whatsapp");
  const stage = params.get("stage");

  if (state) query = query.eq("state", state);
  if (segment) query = query.eq("school_segment", segment);
  if (icp) query = query.eq("icp_match", icp);
  if (minScore) query = query.gte("ai_score", Number.parseInt(minScore, 10));
  if (whatsapp) query = query.eq("whatsapp_ready", "Sim");
  if (stage) query = query.eq("pipeline_stage", stage);

  const limit = Number.parseInt(params.get("limit") ?? "200", 10);
  const { data, error } = await query.limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const id = String(body.id ?? "");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const allowed = new Set(["pipeline_stage", "owner", "notes", "next_action"]);
  const safeUpdates = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)));

  const { data, error } = await supabase
    .from("school_leads")
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const city = String(body.city ?? "").trim();

  if (!name || !city) {
    return NextResponse.json({ error: "name e city são obrigatórios" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    name,
    place_type: toNullableString(body.place_type),
    city,
    state: toNullableString(body.state),
    school_segment: toNullableString(body.school_segment),
    is_private: toNullableString(body.is_private) ?? "Sim",
    phone_number: toNullableString(body.phone_number),
    phone_formatted: toNullableString(body.phone_formatted),
    whatsapp_ready:
      toNullableString(body.whatsapp_ready) ?? (toNullableString(body.phone_formatted) ? "Sim" : "Nao"),
    website: toNullableString(body.website),
    email: toNullableString(body.email),
    address: toNullableString(body.address),
    bairro: toNullableString(body.bairro),
    cep: toNullableString(body.cep),
    latitude: toNullableNumber(body.latitude),
    longitude: toNullableNumber(body.longitude),
    cep_lat: toNullableNumber(body.cep_lat),
    cep_lng: toNullableNumber(body.cep_lng),
    reviews_count: toNullableNumber(body.reviews_count),
    reviews_average: toNullableNumber(body.reviews_average),
    maps_url: toNullableString(body.maps_url),
    cnpj: toNullableString(body.cnpj),
    razao_social: toNullableString(body.razao_social),
    situacao_cadastral: toNullableString(body.situacao_cadastral),
    data_abertura: toNullableString(body.data_abertura),
    capital_social: toNullableNumber(body.capital_social),
    porte: toNullableString(body.porte),
    cnae_principal: toNullableString(body.cnae_principal),
    cnae_descricao: toNullableString(body.cnae_descricao),
    inep_code: toNullableString(body.inep_code),
    total_matriculas: toNullableNumber(body.total_matriculas),
    matriculas_infantil: toNullableNumber(body.matriculas_infantil),
    matriculas_fundamental: toNullableNumber(body.matriculas_fundamental),
    matriculas_medio: toNullableNumber(body.matriculas_medio),
    ideb_ai: toNullableNumber(body.ideb_ai),
    ideb_af: toNullableNumber(body.ideb_af),
    tem_internet: toNullableBoolean(body.tem_internet),
    tem_lab_informatica: toNullableBoolean(body.tem_lab_informatica),
    ai_score: toNullableNumber(body.ai_score),
    icp_match: toNullableString(body.icp_match),
    pain_points: toPainPoints(body.pain_points),
    abordagem_sugerida: toNullableString(body.abordagem_sugerida),
    prioridade: toNullableString(body.prioridade),
    justificativa_score: toNullableString(body.justificativa_score),
    pipeline_stage: toNullableString(body.pipeline_stage) ?? "Novo",
    owner: toNullableString(body.owner),
    notes: toNullableString(body.notes),
    next_action: toNullableString(body.next_action),
    source: toNullableString(body.source) ?? "opencnpj_search",
    place_id: toNullableString(body.place_id),
    data_quality: toNullableNumber(body.data_quality),
    scraped_at: toNullableString(body.scraped_at),
    enriched_at: toNullableString(body.enriched_at),
    scored_at: toNullableString(body.scored_at),
    updated_at: new Date().toISOString(),
  };
  if (!payload.place_id) {
    const fromCnpj = toNullableString(body.cnpj)?.replace(/\D/g, "");
    const fromInep = toNullableString(body.inep_code);
    const fallback =
      fromCnpj ||
      fromInep ||
      `manual-${normalizeToken(name)}-${normalizeToken(city)}-${normalizeToken(payload.state)}`;
    payload.place_id = fallback;
  }

  const conflict = "place_id";

  const { data, error } = await supabase
    .from("school_leads")
    .upsert(payload, { onConflict: conflict })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
