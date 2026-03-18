import { NextRequest, NextResponse } from "next/server";

import { enrichSchoolLead } from "@/lib/intelligence/enrichment";

type RequestBody = {
  cnpj?: string;
  inepCode?: string;
  city?: string;
  state?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RequestBody;
  const cnpj = String(body.cnpj ?? "").trim();
  const inepCode = String(body.inepCode ?? "").trim();
  const city = String(body.city ?? "").trim();
  const state = String(body.state ?? "").trim();

  if (!cnpj && !inepCode && !(city && state)) {
    return NextResponse.json(
      { error: "Informe ao menos: cnpj, inepCode, ou city+state." },
      { status: 400 },
    );
  }

  const result = await enrichSchoolLead({ cnpj, inepCode, city, state });
  return NextResponse.json(result);
}

