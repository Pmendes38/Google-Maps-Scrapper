import Link from "next/link";

import { FilterBar } from "@/components/FilterBar";
import { ImportCsvButton } from "@/components/ImportCsvButton";
import { LeadCard } from "@/components/LeadCard";
import { StatsPanel } from "@/components/StatsPanel";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { SchoolLead } from "@/lib/types";

type SearchValue = string | string[] | undefined;

function one(value: SearchValue): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Record<string, SearchValue>;
}) {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return (
      <main className="wayzen-page px-6 py-10">
        <h1 className="font-[var(--font-outfit)] text-2xl font-semibold">Wayzen Dashboard</h1>
        <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-500/15 p-4 text-rose-100">
          Erro de configuracao do Supabase: {clientError}
        </p>
      </main>
    );
  }

  let query = supabase
    .from("school_leads")
    .select("*")
    .eq("is_private", "Sim")
    .order("ai_score", { ascending: false, nullsFirst: false });

  const state = one(searchParams.state);
  const segment = one(searchParams.segment);
  const icp = one(searchParams.icp);
  const minScore = Number(one(searchParams.min_score) || "0");

  if (state) query = query.eq("state", state);
  if (segment) query = query.eq("school_segment", segment);
  if (icp) query = query.eq("icp_match", icp);
  if (Number.isFinite(minScore) && minScore > 0) query = query.gte("ai_score", minScore);

  const { data, error } = await query.limit(200);
  const leads = (data ?? []) as SchoolLead[];

  if (error) {
    return (
      <main className="wayzen-page px-6 py-10">
        <h1 className="font-[var(--font-outfit)] text-2xl font-semibold">Wayzen Dashboard</h1>
        <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-500/15 p-4 text-rose-100">
          Erro ao carregar leads: {error.message}
        </p>
      </main>
    );
  }

  const total = leads.length;
  const highICP = leads.filter((lead) => lead.icp_match === "alto").length;
  const mediumICP = leads.filter((lead) => lead.icp_match === "medio").length;
  const whatsapp = leads.filter((lead) => lead.whatsapp_ready === "Sim").length;
  const newLeads = leads.filter((lead) => lead.pipeline_stage === "Novo").length;
  const qualifiedLeads = leads.filter((lead) => lead.pipeline_stage === "Qualificado").length;

  const statesCount = new Map<string, number>();
  for (const lead of leads) {
    const key = (lead.state ?? "NA").toUpperCase();
    statesCount.set(key, (statesCount.get(key) ?? 0) + 1);
  }

  const topStates = [...statesCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const avgScore =
    leads.length > 0
      ? Math.round(leads.reduce((acc, item) => acc + (item.ai_score ?? 0), 0) / Math.max(1, leads.length))
      : 0;

  const conversionPotential = total > 0 ? ((highICP + mediumICP) / total) * 100 : 0;

  return (
    <main className="wayzen-page pb-14">
      <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
        <div className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
          <div className="wayzen-card p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Wayzen Data Hub</p>
            <h1 className="mt-3 font-[var(--font-outfit)] text-4xl font-bold leading-tight md:text-5xl">
              Use dados para transformar captacao escolar em previsibilidade
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">
              Painel com oportunidades priorizadas, score de potencial e atalhos para busca, pipeline e mapa.
            </p>

            <div className="mt-6 grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <Link
                className="rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.42)] px-4 py-3 text-sm font-medium text-white/90 transition hover:border-[var(--wayzen-purple)]"
                href="/buscar"
              >
                Buscar por cidade e segmento
              </Link>
              <Link className="wayzen-btn-primary px-4 py-3 text-center text-sm transition hover:brightness-110" href="/buscar">
                Explorar dados
              </Link>
              <div className="min-w-[140px]">
                <ImportCsvButton />
              </div>
            </div>
          </div>

          <aside className="wayzen-card p-5 text-white">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-white/75">Resumo executivo</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[var(--wayzen-border)] bg-[rgba(191,0,255,0.12)] p-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/70">Lead score medio</p>
                <p className="mt-1 font-[var(--font-outfit)] text-3xl font-bold">{avgScore}</p>
              </div>
              <div className="rounded-xl border border-[var(--wayzen-border)] bg-[rgba(0,128,128,0.15)] p-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/70">Potencial de conversao</p>
                <p className="mt-1 font-[var(--font-outfit)] text-3xl font-bold">{formatPct(conversionPotential)}</p>
              </div>
              <Link
                className="block rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.45)] px-4 py-3 text-center text-sm font-semibold transition hover:border-[var(--wayzen-purple)]"
                href="/pipeline"
              >
                Ir para pipeline
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 md:px-6">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
          <div className="wayzen-card p-6">
            <h2 className="font-[var(--font-outfit)] text-2xl font-semibold">Radar de oportunidades</h2>
            <p className="mt-1 text-sm text-white/75">Priorize redes com maior maturidade comercial.</p>
            <div className="mt-5">
              <StatsPanel highICP={highICP} newLeads={newLeads} total={total} whatsapp={whatsapp} />
            </div>
          </div>

          <div className="wayzen-card p-6">
            <h3 className="font-[var(--font-outfit)] text-lg font-semibold">Top estados por volume</h3>
            <div className="mt-4 space-y-2">
              {topStates.length === 0 && <p className="text-sm text-white/70">Sem dados suficientes.</p>}
              {topStates.map(([uf, count]) => (
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm" key={uf}>
                  <span>{uf}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 md:px-6">
        <div className="wayzen-card p-6">
          <div className="mb-6 rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.35)] p-4">
            <FilterBar />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {leads.slice(0, 12).map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>

          {leads.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.25)] p-8 text-center text-sm text-white/70">
              Nenhum lead encontrado. Importe um CSV ou use a busca.
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link className="wayzen-btn-primary px-4 py-2 text-sm transition hover:brightness-110" href="/buscar">
              Ver base completa
            </Link>
            <Link
              className="rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.4)] px-4 py-2 text-sm font-medium text-white/90 transition hover:border-[var(--wayzen-purple)]"
              href="/map"
            >
              Abrir mapa estrategico
            </Link>
            <Link
              className="rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.4)] px-4 py-2 text-sm font-medium text-white/90 transition hover:border-[var(--wayzen-purple)]"
              href="/pipeline"
            >
              Abrir pipeline
            </Link>
            <span className="ml-auto text-xs text-white/55">Qualificados: {qualifiedLeads}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

