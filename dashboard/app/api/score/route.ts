import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT =
  "Voce e especialista em prospeccao B2B educacional. Retorne somente JSON com score, icp_match, pain_points, abordagem_sugerida, prioridade e justificativa_score.";

export async function POST(request: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY nao configurada" }, { status: 500 });
  }

  const body = (await request.json()) as { leads?: unknown[] };
  const leads = Array.isArray(body.leads) ? body.leads : [];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analise os leads e retorne JSON valido: ${JSON.stringify(leads)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text }, { status: response.status });
  }

  const payload = (await response.json()) as { content?: Array<{ text?: string }> };
  const contentText = payload.content?.[0]?.text ?? "[]";

  return NextResponse.json({ raw: contentText });
}
