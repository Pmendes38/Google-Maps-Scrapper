import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
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
  const supabase = createServerSupabaseClient();
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
