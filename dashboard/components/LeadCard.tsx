import Link from "next/link";

import type { SchoolLead } from "@/lib/types";

import { ScoreBadge } from "./ScoreBadge";

function formatPhone(phone: string | null): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return "Nao informado";
}

export function LeadCard({ lead, compact = false }: { lead: SchoolLead; compact?: boolean }) {
  const waLink = lead.phone_formatted ? `https://wa.me/${lead.phone_formatted.replace("+", "")}` : null;
  const website = lead.website ? `https://${lead.website.replace(/^https?:\/\//, "")}` : null;

  return (
    <article className="rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.42)] p-4 transition hover:border-[rgba(191,0,255,0.5)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            className="block truncate font-[var(--font-outfit)] text-base font-semibold text-white hover:text-[#FF79FF]"
            href={`/escolas/${lead.inep_code ?? lead.id}`}
          >
            {lead.name}
          </Link>
          <p className="mt-0.5 text-sm text-white/65">
            {lead.city ?? ""}
            {lead.state ? ` · ${lead.state}` : ""}
            {lead.school_segment ? ` · ${lead.school_segment}` : ""}
          </p>
        </div>
        <ScoreBadge score={lead.ai_score} icp={lead.icp_match} size={compact ? "sm" : "md"} />
      </div>

      {!compact && (
        <div className="mt-3 grid gap-2 text-xs text-white/75 md:grid-cols-2">
          <p>Telefone: {formatPhone(lead.phone_number)}</p>
          <p>CNPJ: {lead.cnpj ?? "Nao informado"}</p>
        </div>
      )}

      {!compact && lead.abordagem_sugerida && (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-xs italic text-white/75">
          "{lead.abordagem_sugerida}"
        </p>
      )}

      {!compact && (
        <div className="mt-3 flex gap-3 border-t border-white/10 pt-3 text-xs">
          {waLink && (
            <a className="font-medium text-[#7BFFB8]" href={waLink} rel="noreferrer" target="_blank">
              WhatsApp →
            </a>
          )}
          {website && (
            <a className="text-[#A5DDFF]" href={website} rel="noreferrer" target="_blank">
              Site →
            </a>
          )}
          {lead.maps_url && (
            <a className="text-white/65" href={lead.maps_url} rel="noreferrer" target="_blank">
              Maps →
            </a>
          )}
        </div>
      )}
    </article>
  );
}

