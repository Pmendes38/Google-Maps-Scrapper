"use client";

import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

import { createClient } from "@/lib/supabase";
import type { PipelineStage, SchoolLead } from "@/lib/types";

import { LeadCard } from "./LeadCard";

const STAGES: PipelineStage[] = ["Novo", "Qualificado", "1° Contato", "Proposta Enviada", "Ganho", "Perdido"];

const COLORS: Record<PipelineStage, string> = {
  Novo: "border-t-gray-400",
  Qualificado: "border-t-blue-400",
  "1° Contato": "border-t-yellow-400",
  "Proposta Enviada": "border-t-orange-400",
  Ganho: "border-t-green-500",
  Perdido: "border-t-red-400",
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
    <section className={`w-72 flex-shrink-0 rounded-xl border-t-4 bg-gray-50 ${COLORS[stage]}`}>
      <header className="border-b border-gray-200 p-3">
        <h3 className="text-sm font-medium">{stage}</h3>
        <span className="text-xs text-gray-400">{leads.length} leads</span>
      </header>
      <div ref={setNodeRef} className="min-h-36 space-y-2 p-2" id={stage}>
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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <StageColumn key={stage} stage={stage} leads={leads.filter((lead) => lead.pipeline_stage === stage)} />
        ))}
      </div>
    </DndContext>
  );
}
