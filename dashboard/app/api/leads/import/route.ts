import Papa from "papaparse";
import { NextRequest, NextResponse } from "next/server";

import { getServerSupabaseClient } from "@/lib/supabase-server";

type CsvLead = Record<string, string | undefined>;

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptional(value: string | undefined): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizePlaceId(row: CsvLead): string | null {
  const place = toOptional(row.place_id);
  if (place) return place;
  const cnpj = String(row.cnpj ?? "").replace(/\D/g, "");
  return cnpj || null;
}

function toLeadPayload(row: CsvLead) {
  return {
    name: String(row.name ?? "").trim(),
    city: String(row.city ?? "").trim(),
    state: toOptional(row.state),
    school_segment: toOptional(row.school_segment),
    is_private: toOptional(row.is_private) ?? "Sim",
    phone_number: toOptional(row.phone_number),
    phone_formatted: toOptional(row.phone_formatted),
    whatsapp_ready: toOptional(row.whatsapp_ready),
    website: toOptional(row.website),
    email: toOptional(row.email),
    address: toOptional(row.address),
    bairro: toOptional(row.bairro),
    cep: toOptional(row.cep),
    cnpj: toOptional(row.cnpj),
    razao_social: toOptional(row.razao_social),
    situacao_cadastral: toOptional(row.situacao_cadastral),
    data_abertura: toOptional(row.data_abertura),
    capital_social: toNumber(row.capital_social),
    porte: toOptional(row.porte),
    cnae_descricao: toOptional(row.cnae_descricao),
    ai_score: toNumber(row.ai_score),
    icp_match: toOptional(row.icp_match),
    prioridade: toOptional(row.prioridade),
    pipeline_stage: toOptional(row.pipeline_stage) ?? "Novo",
    source: toOptional(row.source) ?? "csv_import",
    place_id: normalizePlaceId(row),
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: clientError }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo CSV não enviado" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<CsvLead>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        inserted: 0,
        updated: 0,
        errors: parsed.errors.map((e) => e.message),
      },
      { status: 400 },
    );
  }

  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of parsed.data) {
    const payload = toLeadPayload(row);
    if (!payload.name || !payload.city) {
      errors.push("Linha ignorada: name/city ausentes");
      continue;
    }

    try {
      let existingId: string | null = null;

      if (payload.place_id) {
        const { data: existingByPlace } = await supabase
          .from("school_leads")
          .select("id")
          .eq("place_id", payload.place_id)
          .maybeSingle();
        existingId = existingByPlace?.id ?? null;
      }

      if (!existingId) {
        const { data: existingByNameCity } = await supabase
          .from("school_leads")
          .select("id")
          .eq("name", payload.name)
          .eq("city", payload.city)
          .maybeSingle();
        existingId = existingByNameCity?.id ?? null;
      }

      if (existingId) {
        const { error } = await supabase.from("school_leads").update(payload).eq("id", existingId);
        if (error) {
          errors.push(error.message);
        } else {
          updated += 1;
        }
      } else {
        const { error } = await supabase.from("school_leads").insert(payload);
        if (error) {
          errors.push(error.message);
        } else {
          inserted += 1;
        }
      }
    } catch (error) {
      errors.push(String(error));
    }
  }

  return NextResponse.json({ inserted, updated, errors });
}
