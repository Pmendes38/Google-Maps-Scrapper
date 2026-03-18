import Link from "next/link";

import { SchoolMap } from "@/components/SchoolMap";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { SchoolLead } from "@/lib/types";

export default async function MapPage() {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return (
      <main className="wayzen-page px-6 py-10">
        <h1 className="font-[var(--font-outfit)] text-2xl font-semibold">Mapa de Leads</h1>
        <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-500/15 p-4 text-rose-100">
          Erro de configuracao do Supabase: {clientError}
        </p>
      </main>
    );
  }

  const { data, error } = await supabase
    .from("school_leads")
    .select("*")
    .eq("is_private", "Sim")
    .order("ai_score", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) {
    return (
      <main className="wayzen-page px-6 py-10">
        <h1 className="font-[var(--font-outfit)] text-2xl font-semibold">Mapa de Leads</h1>
        <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-500/15 p-4 text-rose-100">
          Erro ao carregar mapa: {error.message}
        </p>
      </main>
    );
  }

  return (
    <main className="wayzen-page px-4 py-8 md:px-6">
      <section className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-[var(--font-outfit)] text-3xl font-bold tracking-tight">Mapa de Leads</h1>
            <p className="mt-1 text-sm text-white/70">Visualizacao geoespacial no tema Dark Matter.</p>
          </div>
          <Link
            className="rounded-full border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.4)] px-4 py-2 text-sm text-white/90 transition hover:border-[var(--wayzen-purple)]"
            href="/"
          >
            Voltar
          </Link>
        </header>
        <div className="wayzen-card p-3">
          <SchoolMap leads={(data ?? []) as SchoolLead[]} />
        </div>
      </section>
    </main>
  );
}

