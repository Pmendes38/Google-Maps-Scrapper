import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }
  const params = request.nextUrl.searchParams;
  const format = params.get("format") ?? "csv";

  let query = supabase
    .from("school_leads")
    .select("name,phone_formatted,whatsapp_ready,website,email,city,state,school_segment,ai_score,icp_match,abordagem_sugerida,pipeline_stage")
    .eq("is_private", "Sim")
    .order("ai_score", { ascending: false, nullsFirst: false });

  if (params.get("whatsapp") === "true") {
    query = query.eq("whatsapp_ready", "Sim");
  }

  const { data, error } = await query.limit(5000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Sem dados" }, { status: 404 });
  }

  if (format === "json") {
    return NextResponse.json(data);
  }

  const header = Object.keys(data[0]).join(",");
  const rows = data.map((row) =>
    Object.values(row)
      .map((value) => {
        const normalized = value ?? "";
        if (typeof normalized === "string" && normalized.includes(",")) {
          return `"${normalized}"`;
        }
        return String(normalized);
      })
      .join(","),
  );

  return new NextResponse("\uFEFF" + [header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wayzen_leads_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
