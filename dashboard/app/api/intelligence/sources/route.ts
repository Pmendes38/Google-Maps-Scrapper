import { NextResponse } from "next/server";

import { listIntelligenceSources } from "@/lib/intelligence/enrichment";

export async function GET() {
  const sources = listIntelligenceSources();
  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    total: sources.length,
    sources,
  });
}

