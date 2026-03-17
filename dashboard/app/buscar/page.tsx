"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { LeadCard } from "@/components/LeadCard";
import type { SchoolLead } from "@/lib/types";

type SegmentOption = {
  label: string;
  cnae: string;
};

type UfOption = {
  sigla: string;
  nome: string;
};

type CityOption = {
  nome: string;
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
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [cnae, setCnae] = useState(SEGMENTS[0].cnae);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUfs, setIsLoadingUfs] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [results, setResults] = useState<SchoolLead[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [ufs, setUfs] = useState<UfOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);

  const segmentLabel = useMemo(() => SEGMENTS.find((s) => s.cnae === cnae)?.label ?? "", [cnae]);

  useEffect(() => {
    let isMounted = true;
    async function loadUfs() {
      setIsLoadingUfs(true);
      try {
        const response = await fetch("https://brasilapi.com.br/api/ibge/uf/v1", { cache: "no-store" });
        const payload = (await response.json()) as UfOption[];
        if (isMounted && Array.isArray(payload)) {
          const sorted = [...payload].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
          setUfs(sorted);
        }
      } catch {
        if (isMounted) setToast("Falha ao carregar lista de estados.");
      } finally {
        if (isMounted) setIsLoadingUfs(false);
      }
    }
    loadUfs();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCities() {
      if (!estado) {
        setCities([]);
        setCidade("");
        return;
      }

      setIsLoadingCities(true);
      setCidade("");
      try {
        const response = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${estado}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as CityOption[];
        if (isMounted && Array.isArray(payload)) {
          const sorted = [...payload].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
          setCities(sorted);
        }
      } catch {
        if (isMounted) {
          setCities([]);
          setToast("Falha ao carregar lista de cidades para o estado selecionado.");
        }
      } finally {
        if (isMounted) setIsLoadingCities(false);
      }
    }

    loadCities();
    return () => {
      isMounted = false;
    };
  }, [estado]);

  async function handleBuscar() {
    if (!estado || !cidade.trim()) {
      setToast("Selecione estado e cidade para buscar.");
      return;
    }

    setIsLoading(true);
    setToast(null);

    try {
      const response = await fetch("/api/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, cidade, cnae }),
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

  async function salvarTodosNoPipeline() {
    if (results.length === 0) return;
    setIsLoading(true);

    let ok = 0;
    let fail = 0;

    for (const lead of results) {
      try {
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead),
        });
        if (response.ok) ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
    }

    setIsLoading(false);
    setToast(`${ok} leads salvos no pipeline${fail ? ` (${fail} falharam)` : ""}.`);
    setTimeout(() => setToast(null), 4000);
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
        <p className="mt-1 text-sm text-gray-600">Fonte primária: Censo INEP. Depois cruzamos com BrasilAPI (CNPJ/CEP) e calculamos score heurístico.</p>
      </header>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            disabled={isLoadingUfs}
            onChange={(e) => setEstado(e.target.value)}
            value={estado}
          >
            <option value="">{isLoadingUfs ? "Carregando estados..." : "Selecione o estado"}</option>
            {ufs.map((uf) => (
              <option key={uf.sigla} value={uf.sigla}>
                {uf.nome} ({uf.sigla})
              </option>
            ))}
          </select>

          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            disabled={!estado || isLoadingCities}
            onChange={(e) => setCidade(e.target.value)}
            value={cidade}
          >
            <option value="">
              {!estado
                ? "Selecione o estado primeiro"
                : isLoadingCities
                  ? "Carregando cidades..."
                  : "Selecione a cidade"}
            </option>
            {cities.map((city) => (
              <option key={city.nome} value={city.nome}>
                {city.nome}
              </option>
            ))}
          </select>

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
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Segmento selecionado: {segmentLabel}</p>
          {results.length > 0 && (
            <button
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs hover:border-gray-400"
              disabled={isLoading}
              onClick={salvarTodosNoPipeline}
              type="button"
            >
              + Salvar todos no Pipeline
            </button>
          )}
        </div>
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
            <Link
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-sm hover:border-gray-400"
              href={`/escolas/${lead.inep_code ?? lead.id}`}
            >
              Ver página da escola
            </Link>
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
