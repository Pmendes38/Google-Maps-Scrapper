import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const SYSTEM_PROMPT = `Você é especialista em prospecção B2B educacional brasileiro.
Analise leads de escolas e retorne um JSON com scores estruturados.

Para cada lead, retorne:
- score: 0-100 (baseado em matrículas, capital social, ratings, IDEB, segmento)
- icp_match: 'alto' | 'medio' | 'baixo'
- pain_points: array de até 3 dores principais
- abordagem_sugerida: 1-2 frases para WhatsApp/abertura de contato
- prioridade: 'imediata' | 'normal' | 'baixa'
- justificativa_score: 1 frase explicando o score

Retorne APENAS JSON válido. Sem markdown. Array com um objeto por lead.`;

interface ScoreResult {
  id?: string;
  idx?: number;
  score: number;
  icp_match: "alto" | "medio" | "baixo";
  pain_points: string[];
  abordagem_sugerida: string;
  prioridade: "imediata" | "normal" | "baixa";
  justificativa_score: string;
}

export async function POST(request: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY nao configurada" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as { leads?: unknown[]; persist?: boolean };
  const leads = Array.isArray(body.leads) ? body.leads : [];
  const shouldPersist = body.persist !== false;

  if (leads.length === 0) {
    return NextResponse.json({ scores: [], persisted: 0 });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analise estes leads e retorne array JSON: ${JSON.stringify(
            leads,
            null,
            2
          )}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text }, { status: response.status });
  }

  const payload = (await response.json()) as {
    content?: Array<{ text?: string }>;
  };
  const contentText = payload.content?.[0]?.text ?? "[]";

  // Parse JSON com fallback
  let scores: ScoreResult[] = [];
  try {
    const parsed = JSON.parse(contentText);
    scores = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    // Tentar extrair JSON dentro de markdown
    const match = contentText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        scores = JSON.parse(match[0]);
      } catch {
        console.error("Failed to parse Claude response:", contentText);
        return NextResponse.json(
          { error: "Invalid JSON response from Claude API" },
          { status: 500 }
        );
      }
    }
  }

  // Validar e normalizar scores
  const normalized = scores.map((s) => ({
    id: s.id ?? "",
    idx: s.idx ?? 0,
    score: Math.min(100, Math.max(0, s.score || 0)),
    icp_match: s.icp_match || "baixo",
    pain_points: Array.isArray(s.pain_points) ? s.pain_points : [],
    abordagem_sugerida: s.abordagem_sugerida || "",
    prioridade: s.prioridade || "normal",
    justificativa_score: s.justificativa_score || "",
  }));

  let persisted = 0;

  // Persistir no Supabase se houver IDs de lead
  if (shouldPersist) {
    const supabase = createServerSupabaseClient();
    for (const score of normalized) {
      if (!score.id) continue;
      try {
        const { error } = await supabase
          .from("school_leads")
          .update({
            ai_score: score.score,
            icp_match: score.icp_match,
            pain_points: score.pain_points,
            abordagem_sugerida: score.abordagem_sugerida,
            prioridade: score.prioridade,
            justificativa_score: score.justificativa_score,
            updated_at: new Date().toISOString(),
          })
          .eq("id", score.id);
        if (!error) persisted++;
        else console.error(`Erro ao persistir ${score.id}:`, error);
      } catch (e) {
        console.error(`Erro ao persistir score:`, e);
      }
    }
  }

  return NextResponse.json({
    scores: normalized,
    persisted,
    raw: contentText,
  });
}
