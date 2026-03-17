"use client";

import { useMemo, useState } from "react";

import { LeadCard } from "@/components/LeadCard";
import type { SchoolLead } from "@/lib/types";

type SegmentOption = {
  label: string;
  cnae: string;
};

const SEGMENTS: SegmentOption[] = [
  { label: "Ensino Fundamental", cnae: "8513900" },
  { label: "Ensino Médio", cnae: "8520100" },
  { label: "Educação Infantil", cnae: "8512100" },
  { label: "Creche", cnae: "8511200" },
  { label: "Ensino Técnico", cnae: "8541400" },
  { label: "Ensino de Idiomas", cnae: "8593700" },
];

export default function BuscarPage() {
  const [cidade, setCidade] = useState("");
  const [cnae, setCnae] = useState(SEGMENTS[0].cnae);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SchoolLead[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const segmentLabel = useMemo(() => SEGMENTS.find((s) => s.cnae === cnae)?.label ?? "", [cnae]);

  async function handleBuscar() {
    if (!cidade.trim()) {
      setToast("Informe uma cidade para buscar.");
      return;
    }

    setIsLoading(true);
    setToast(null);

    try {
      const response = await fetch("/api/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cidade, cnae }),
      });

      const payload = (await response.json()) as SchoolLead[] | { error?: string };
      if (!response.ok) {
        setResults([]);
        setToast((payload as { error?: string }).error ?? "Erro ao buscar escolas");
      } else {
        setResults(Array.isArray(payload) ? payload : []);
        if (Array.isArray(payload) && payload.length === 0) {
          setToast("Nenhum resultado encontrado para essa busca.");
        }
      }
    } catch (error) {
      setToast(`Erro ao buscar: ${String(error)}`);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function salvarNoPipeline(lead: SchoolLead) {
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setToast(payload.error ?? "Falha ao salvar lead");
      } else {
        setToast(`${lead.name} salvo no pipeline.`);
      }
    } catch (error) {
      setToast(`Erro ao salvar lead: ${String(error)}`);
    } finally {
      setTimeout(() => setToast(null), 3500);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Buscar Escolas</h1>
        <p className="mt-1 text-sm text-gray-600">Pesquisa ativa com OpenCNPJ + enriquecimento de CEP + score heurístico</p>
      </header>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Cidade (ex: Brasília, São Paulo)"
            value={cidade}
          />
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            onChange={(e) => setCnae(e.target.value)}
            value={cnae}
          >
            {SEGMENTS.map((segment) => (
              <option key={segment.cnae} value={segment.cnae}>
                {segment.label} ({segment.cnae})
              </option>
            ))}
          </select>
          <button
            className="rounded-lg border border-gray-300 bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={handleBuscar}
            type="button"
          >
            {isLoading ? "Buscando..." : "Buscar"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Segmento selecionado: {segmentLabel}</p>
      </section>

      {isLoading && (
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          Buscando e calculando score local...
        </div>
      )}

      {toast && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">{toast}</div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {results.map((lead) => (
          <div className="space-y-2" key={lead.id}>
            <LeadCard lead={lead} />
            <button
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-400"
              onClick={() => salvarNoPipeline(lead)}
              type="button"
            >
              + Salvar no Pipeline
            </button>
          </div>
        ))}
      </section>
    </main>
  );
}
