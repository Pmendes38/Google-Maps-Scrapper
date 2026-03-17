import Link from "next/link";

import { KanbanBoard } from "@/components/KanbanBoard";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { SchoolLead } from "@/lib/types";

export default async function PipelinePage() {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Erro de configuracao do Supabase: {clientError}</p>
      </main>
    );
  }
  const { data, error } = await supabase
    .from("school_leads")
    .select("*")
    .eq("is_private", "Sim")
    .order("updated_at", { ascending: false })
    .limit(300);

  if (error) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Erro ao carregar pipeline: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Pipeline Comercial</h1>
        <Link className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:border-gray-400" href="/">
          Voltar
        </Link>
      </header>
      <KanbanBoard initialLeads={(data ?? []) as SchoolLead[]} />
    </main>
  );
}
