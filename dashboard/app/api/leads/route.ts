import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";

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

  const payload = {
    name,
    city,
    state: body.state ? String(body.state) : null,
    school_segment: body.school_segment ? String(body.school_segment) : null,
    is_private: body.is_private ? String(body.is_private) : "Sim",
    phone_number: body.phone_number ? String(body.phone_number) : null,
    phone_formatted: body.phone_formatted ? String(body.phone_formatted) : null,
    whatsapp_ready: body.whatsapp_ready ? String(body.whatsapp_ready) : null,
    website: body.website ? String(body.website) : null,
    email: body.email ? String(body.email) : null,
    address: body.address ? String(body.address) : null,
    bairro: body.bairro ? String(body.bairro) : null,
    cep: body.cep ? String(body.cep) : null,
    cnpj: body.cnpj ? String(body.cnpj) : null,
    razao_social: body.razao_social ? String(body.razao_social) : null,
    situacao_cadastral: body.situacao_cadastral ? String(body.situacao_cadastral) : null,
    data_abertura: body.data_abertura ? String(body.data_abertura) : null,
    capital_social: typeof body.capital_social === "number" ? body.capital_social : null,
    porte: body.porte ? String(body.porte) : null,
    cnae_descricao: body.cnae_descricao ? String(body.cnae_descricao) : null,
    ai_score: typeof body.ai_score === "number" ? body.ai_score : null,
    icp_match: body.icp_match ? String(body.icp_match) : null,
    pipeline_stage: "Novo",
    source: body.source ? String(body.source) : "opencnpj_search",
    place_id: body.place_id ? String(body.place_id) : null,
    updated_at: new Date().toISOString(),
  };

  const conflict = payload.place_id ? "place_id" : "name,city";

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
