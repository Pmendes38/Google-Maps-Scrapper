import Link from "next/link";

import { SchoolMap } from "@/components/SchoolMap";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { SchoolLead } from "@/lib/types";

export default async function MapPage() {
  const { supabase, error: clientError } = getServerSupabaseClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Mapa de Leads</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Erro de configuracao do Supabase: {clientError}</p>
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
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Mapa de Leads</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Erro ao carregar mapa: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Mapa de Leads</h1>
        <Link className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:border-gray-400" href="/">
          Voltar
        </Link>
      </header>
      <div className="rounded-2xl border border-gray-200 bg-white p-3">
        <SchoolMap leads={(data ?? []) as SchoolLead[]} />
      </div>
    </main>
  );
}
