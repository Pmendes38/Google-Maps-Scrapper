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
  const whatsapp = leads.filter((lead) => lead.whatsapp_ready === "Sim").length;
  const newLeads = leads.filter((lead) => lead.pipeline_stage === "Novo").length;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Wayzen School Intelligence</h1>
          <p className="mt-1 text-sm text-gray-600">Leads priorizados para operacao comercial escolar</p>
        </div>
        <ImportCsvButton />
      </header>

      <section className="mb-6">
        <StatsPanel total={total} highICP={highICP} whatsapp={whatsapp} newLeads={newLeads} />
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white/90 p-4">
        <FilterBar />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </section>
    </main>
  );
}
