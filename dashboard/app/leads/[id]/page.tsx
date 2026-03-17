import Link from "next/link";
import { notFound } from "next/navigation";

import { ScoreBadge } from "@/components/ScoreBadge";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import type { SchoolLead } from "@/lib/types";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = getServerSupabaseClient();
  if (!supabase) {
    notFound();
  }
  const { data, error } = await supabase.from("school_leads").select("*").eq("id", params.id).single();

  if (error || !data) {
    notFound();
  }

  const lead = data as SchoolLead;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{lead.name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {lead.city ?? ""}
            {lead.state ? ` · ${lead.state}` : ""}
            {lead.school_segment ? ` · ${lead.school_segment}` : ""}
          </p>
        </div>
        <ScoreBadge score={lead.ai_score} icp={lead.icp_match} />
      </header>

      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-medium text-gray-500">Contato</h2>
          <p className="mt-2 text-sm">Telefone: {lead.phone_number ?? "-"}</p>
          <p className="text-sm">WhatsApp: {lead.whatsapp_ready ?? "-"}</p>
          <p className="text-sm">Website: {lead.website ?? "-"}</p>
          <p className="text-sm">Email: {lead.email ?? "-"}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-gray-500">Comercial</h2>
          <p className="mt-2 text-sm">Pipeline: {lead.pipeline_stage}</p>
          <p className="text-sm">Prioridade: {lead.prioridade ?? "-"}</p>
          <p className="text-sm">Owner: {lead.owner ?? "-"}</p>
          <p className="text-sm">Data quality: {lead.data_quality ?? "-"}</p>
        </div>
      </section>

      {lead.abordagem_sugerida && (
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium text-gray-500">Abordagem sugerida</h2>
          <p className="mt-2 text-sm text-gray-700">{lead.abordagem_sugerida}</p>
        </section>
      )}

      <div className="mt-6 flex gap-3">
        <Link className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:border-gray-400" href="/">
          Voltar
        </Link>
        {lead.maps_url && (
          <a className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:border-gray-400" href={lead.maps_url} rel="noreferrer" target="_blank">
            Abrir Maps
          </a>
        )}
      </div>
    </main>
  );
}
