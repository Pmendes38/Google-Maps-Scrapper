import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";

type CityOption = { nome: string };

function sortedUniqueCities(items: string[]): CityOption[] {
  const unique = Array.from(new Set(items.map((v) => v.trim()).filter(Boolean)));
  unique.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return unique.map((nome) => ({ nome }));
}

export async function GET(request: NextRequest) {
  const uf = String(request.nextUrl.searchParams.get("uf") ?? "").trim().toUpperCase();
  if (!uf) {
    return NextResponse.json([]);
  }

  // First attempt: BrasilAPI city list for UF.
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`, { cache: "no-store" });
    if (resp.ok) {
      const payload = (await resp.json()) as CityOption[];
      if (Array.isArray(payload) && payload.length > 0) {
        const sorted = [...payload].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        return NextResponse.json(sorted);
      }
    }
  } catch {
    // fallback below
  }

  // Fallback: read distinct cities already loaded in INEP table.
  const { supabase } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json([]);
  }

  const { data } = await supabase
    .from("inep_schools")
    .select("no_municipio")
    .eq("sg_uf", uf)
    .limit(20000);

  const cities = (data ?? [])
    .map((row) => String(row.no_municipio ?? "").trim())
    .filter(Boolean);

  return NextResponse.json(sortedUniqueCities(cities));
}
