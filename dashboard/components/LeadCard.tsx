import Link from "next/link";

import type { SchoolLead } from "@/lib/types";

import { ScoreBadge } from "./ScoreBadge";

export function LeadCard({ lead, compact = false }: { lead: SchoolLead; compact?: boolean }) {
  const waLink = lead.phone_formatted ? `https://wa.me/${lead.phone_formatted.replace("+", "")}` : null;
  const website = lead.website ? `https://${lead.website.replace(/^https?:\/\//, "")}` : null;

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link className="block truncate font-medium text-gray-900 hover:text-[var(--accent)]" href={`/leads/${lead.id}`}>
            {lead.name}
          </Link>
          <p className="mt-0.5 text-sm text-gray-500">
            {lead.city ?? ""}
            {lead.state ? ` · ${lead.state}` : ""}
            {lead.school_segment ? ` · ${lead.school_segment}` : ""}
          </p>
        </div>
        <ScoreBadge score={lead.ai_score} icp={lead.icp_match} size={compact ? "sm" : "md"} />
      </div>

      {!compact && lead.abordagem_sugerida && (
        <p className="mt-3 text-xs italic text-gray-600">"{lead.abordagem_sugerida}"</p>
      )}

      {!compact && (
        <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3 text-xs">
          {waLink && (
            <a className="font-medium text-green-600" href={waLink} rel="noreferrer" target="_blank">
              WhatsApp &rarr;
            </a>
          )}
          {website && (
            <a className="text-blue-600" href={website} rel="noreferrer" target="_blank">
              Site &rarr;
            </a>
          )}
          {lead.maps_url && (
            <a className="text-gray-500" href={lead.maps_url} rel="noreferrer" target="_blank">
              Maps &rarr;
            </a>
          )}
        </div>
      )}
    </article>
  );
}
