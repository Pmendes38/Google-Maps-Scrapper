import Link from "next/link";

import { FilterBar } from "@/components/FilterBar";
import { ImportCsvButton } from "@/components/ImportCsvButton";
import { LeadCard } from "@/components/LeadCard";
import { StatsPanel } from "@/components/StatsPanel";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { SchoolLead } from "@/lib/types";

type SearchValue = string | string[] | undefined;

function one(value: SearchValue): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
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
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Wayzen Dashboard</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Erro de configuracao do Supabase: {clientError}</p>
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
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Wayzen Dashboard</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Erro ao carregar leads: {error.message}</p>
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

  const topStates = [...statesCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const avgScore =
    leads.length > 0
      ? Math.round(
          leads.reduce((acc, item) => acc + (item.ai_score ?? 0), 0) / Math.max(1, leads.length),
        )
      : 0;

  const conversionPotential = total > 0 ? ((highICP + mediumICP) / total) * 100 : 0;

  return (
    <main className="min-h-screen bg-[#0a5d95] pb-14">
      <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
        <div className="grid gap-5 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="rounded-[28px] border border-sky-100/80 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-7 shadow-2xl shadow-slate-900/20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Wayzen Data Hub</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight text-slate-900 md:text-5xl">
              Use dados. Transforme captacao escolar em previsibilidade.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
              Painel inicial com indicadores de oportunidade, prioridades comerciais e atalhos para sua operacao.
            </p>

            <div className="mt-6 grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <Link
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                href="/buscar"
              >
                Buscar por escola, cidade ou estado
              </Link>
              <Link
                className="rounded-xl bg-sky-700 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-sky-800"
                href="/buscar"
              >
                Explorar dados
              </Link>
              <div className="min-w-[140px]">
                <ImportCsvButton />
              </div>
            </div>
          </div>

          <aside className="rounded-[28px] border border-cyan-200/35 bg-gradient-to-b from-sky-700/95 to-[#04345e] p-5 text-white shadow-2xl shadow-slate-950/35">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-cyan-100">Resumo executivo</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/85">Lead score medio</p>
                <p className="mt-1 text-3xl font-bold">{avgScore}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/85">Potencial de conversao</p>
                <p className="mt-1 text-3xl font-bold">{formatPct(conversionPotential)}</p>
              </div>
              <Link
                className="block rounded-2xl border border-cyan-200/55 bg-cyan-200/20 px-4 py-3 text-center text-sm font-semibold transition hover:bg-cyan-200/30"
                href="/pipeline"
              >
                Ir para pipeline
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 md:px-6">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-3xl border border-cyan-100/30 bg-[#0c568a] p-6 text-white shadow-xl shadow-slate-950/25">
            <h2 className="text-2xl font-semibold">Radar de oportunidades</h2>
            <p className="mt-1 text-sm text-cyan-100/80">Priorize as redes com maior maturidade comercial e melhores sinais de contato.</p>
            <div className="mt-5">
              <StatsPanel total={total} highICP={highICP} whatsapp={whatsapp} newLeads={newLeads} />
            </div>
          </div>

          <div className="rounded-3xl border border-cyan-100/30 bg-[#0c568a] p-6 text-white shadow-xl shadow-slate-950/25">
            <h3 className="text-lg font-semibold">Top estados por volume</h3>
            <div className="mt-4 space-y-2">
              {topStates.length === 0 && <p className="text-sm text-cyan-100/80">Sem dados suficientes.</p>}
              {topStates.map(([uf, count]) => (
                <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm" key={uf}>
                  <span>{uf}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 md:px-6">
        <div className="rounded-3xl bg-slate-100 p-6 shadow-xl shadow-slate-950/15">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Leads novos</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{newLeads}</p>
              <p className="mt-2 text-xs text-slate-500">Entradas recentes no funil</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Qualificados</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{qualifiedLeads}</p>
              <p className="mt-2 text-xs text-slate-500">Leads prontos para contato ativo</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">ICP alto</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{highICP}</p>
              <p className="mt-2 text-xs text-slate-500">Maior aderencia ao perfil ideal</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">WhatsApp ativo</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{whatsapp}</p>
              <p className="mt-2 text-xs text-slate-500">Velocidade de abordagem inicial</p>
            </article>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <FilterBar />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {leads.slice(0, 12).map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" href="/buscar">
              Ver base completa
            </Link>
            <Link className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400" href="/map">
              Abrir mapa estrategico
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
