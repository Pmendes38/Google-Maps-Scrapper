import { NextRequest, NextResponse } from "next/server";

import { computeIcpFitScore } from "@/lib/icp-scoring";
import { getServerSupabaseClient } from "@/lib/supabase-server";

type LeadInput = {
  id?: string;
  school_segment?: string | null;
  is_private?: string | null;
  total_matriculas?: number | null;
  matriculas_infantil?: number | null;
  matriculas_fundamental?: number | null;
  matriculas_medio?: number | null;
  phone_number?: string | null;
  phone_formatted?: string | null;
  website?: string | null;
  address?: string | null;
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isPrivateFlag(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "sim" || text === "privada" || text === "private";
}

function estimateRevenue(totalMatriculas: number | null): number {
  const students = Math.max(0, Number(totalMatriculas ?? 0));
  return students * 700;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { leads?: LeadInput[]; persist?: boolean };
  const leads = Array.isArray(body.leads) ? body.leads : [];
  const shouldPersist = body.persist !== false;

  if (leads.length === 0) {
    return NextResponse.json({ scores: [], persisted: 0 });
  }

  const scores = leads.map((lead, idx) => {
    const totalMatriculas = toNumber(lead.total_matriculas);
    const result = computeIcpFitScore({
      schoolSegment: lead.school_segment ?? null,
      isPrivate: isPrivateFlag(lead.is_private),
      totalMatriculas,
      matriculasInfantil: toNumber(lead.matriculas_infantil),
      matriculasFundamental: toNumber(lead.matriculas_fundamental),
      matriculasMedio: toNumber(lead.matriculas_medio),
      hasPhone: Boolean(String(lead.phone_formatted ?? lead.phone_number ?? "").trim()),
      hasAddressOrWebsite: Boolean(String(lead.website ?? lead.address ?? "").trim()),
      estimatedRevenue: estimateRevenue(totalMatriculas),
    });

    return {
      id: String(lead.id ?? ""),
      idx,
      score: result.score,
      icp_match: result.icpMatch,
      pain_points: result.painPoints,
      abordagem_sugerida: result.abordagem,
      prioridade: result.prioridade,
      justificativa_score: result.justificativa,
      dimensions: result.dimensions,
    };
  });

  let persisted = 0;

  if (shouldPersist) {
    const { supabase } = getServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase nao configurado para persistencia de scores" },
        { status: 500 },
      );
    }

    for (const score of scores) {
      if (!score.id) continue;
      const { error } = await supabase
        .from("school_leads")
        .update({
          ai_score: score.score,
          icp_match: score.icp_match,
          pain_points: score.pain_points,
          abordagem_sugerida: score.abordagem_sugerida,
          prioridade: score.prioridade,
          justificativa_score: score.justificativa_score,
          scored_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", score.id);

      if (!error) persisted += 1;
    }
  }

  return NextResponse.json({
    scores,
    persisted,
    model: "icp_fit_v1",
  });
}
