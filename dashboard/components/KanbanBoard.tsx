"use client";

import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

import { createClient } from "@/lib/supabase";
import type { PipelineStage, SchoolLead } from "@/lib/types";

import { LeadCard } from "./LeadCard";

const STAGES: PipelineStage[] = ["Novo", "Qualificado", "1° Contato", "Proposta Enviada", "Ganho", "Perdido"];

const STAGE_TOP_COLOR: Record<PipelineStage, string> = {
  Novo: "border-t-[#8752FF]",
  Qualificado: "border-t-[#00B8FF]",
  "1° Contato": "border-t-[#FF8C00]",
  "Proposta Enviada": "border-t-[#FFB020]",
  Ganho: "border-t-[#00C38A]",
  Perdido: "border-t-[#FF3E7D]",
};

function DraggableLeadCard({ lead }: { lead: SchoolLead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.55 : 1 }}
      {...attributes}
      {...listeners}
    >
      <LeadCard lead={lead} compact />
    </div>
  );
}

function StageColumn({ stage, leads }: { stage: PipelineStage; leads: SchoolLead[] }) {
  const { setNodeRef } = useDroppable({ id: stage });
  return (
    <section
      className={`w-80 flex-shrink-0 rounded-xl border border-[var(--wayzen-border)] border-t-4 bg-[rgba(39,39,87,0.28)] ${STAGE_TOP_COLOR[stage]}`}
    >
      <header className="border-b border-white/10 p-3">
        <h3 className="font-[var(--font-outfit)] text-sm font-semibold text-white">{stage}</h3>
        <span className="text-xs text-white/55">{leads.length} leads</span>
      </header>
      <div className="min-h-36 space-y-2 p-2" id={stage} ref={setNodeRef}>
        {leads.map((lead) => (
          <DraggableLeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </section>
  );
}

export function KanbanBoard({ initialLeads }: { initialLeads: SchoolLead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const supabase = createClient();

  async function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return;

    const leadId = String(event.active.id);
    const newStage = String(event.over.id) as PipelineStage;

    const previousLead = leads.find((lead) => lead.id === leadId);
    if (!previousLead || previousLead.pipeline_stage === newStage) return;

    const previousStage = previousLead.pipeline_stage;
    setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, pipeline_stage: newStage } : lead)));

    const { error } = await supabase
      .from("school_leads")
      .update({ pipeline_stage: newStage, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, pipeline_stage: previousStage } : lead)));
    }
  }

  return (
    <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <StageColumn key={stage} leads={leads.filter((lead) => lead.pipeline_stage === stage)} stage={stage} />
        ))}
      </div>
    </DndContext>
  );
}
