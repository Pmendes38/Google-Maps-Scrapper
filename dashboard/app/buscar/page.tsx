"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

function formatCnpj(value: string | null): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 14) return "Nao informado";
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatMoney(value: number | null): string {
  if (!value || value <= 0) return "Nao informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPhone(value: string | null): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return "Nao informado";
}

function formatYearsSince(value: string | null): string {
  if (!value) return "Nao informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nao informado";
  const years = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)));
  if (years === 0) return "Menos de 1 ano";
  if (years === 1) return "1 ano";
  return `${years} anos`;
}

function websiteHref(value: string | null): string | null {
  const site = String(value ?? "").trim();
  if (!site) return null;
  if (site.startsWith("http://") || site.startsWith("https://")) return site;
  return `https://${site}`;
}

function scoreTone(score: number | null): { label: string; classes: string; dot: string } {
  const num = score ?? 0;
  if (num >= 65) {
    return {
      label: "Alta prioridade",
      classes: "border-emerald-300/70 bg-emerald-300/20 text-emerald-50",
      dot: "bg-emerald-300",
    };
  }
  if (num >= 40) {
    return {
      label: "Media prioridade",
      classes: "border-amber-300/70 bg-amber-300/20 text-amber-50",
      dot: "bg-amber-300",
    };
  }
  return {
    label: "Baixa prioridade",
    classes: "border-rose-300/70 bg-rose-300/20 text-rose-50",
    dot: "bg-rose-300",
  };
}

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
        const response = await fetch("/api/localidades/ufs", { cache: "no-store" });
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
        const response = await fetch(`/api/localidades/cidades?uf=${estado}`, {
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
    <main className="min-h-screen bg-[#0a4f82] pb-16 text-white">
      <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.9fr]">
          <div className="relative overflow-hidden rounded-[28px] border border-sky-100/80 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-6 text-slate-900 shadow-2xl shadow-slate-900/20 md:p-8">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-sky-300/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-cyan-200/30 blur-3xl" />

            <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Wayzen School Intelligence</p>
            <h1 className="relative mt-3 max-w-3xl text-3xl font-semibold leading-tight text-slate-900 md:text-5xl">
              Use dados para transformar captação escolar em previsibilidade.
            </h1>
            <p className="relative mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
              A busca usa Censo INEP como fonte principal, cruza com BrasilAPI e prioriza as escolas por potencial real de conversao.
            </p>

            <div className="relative mt-6 grid gap-3 md:grid-cols-4">
              <select
                className="rounded-xl border border-slate-300/80 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
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
                className="rounded-xl border border-slate-300/80 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
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
                className="rounded-xl border border-slate-300/80 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
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
                className="rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/20 transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                onClick={handleBuscar}
                type="button"
              >
                {isLoading ? "Buscando..." : "Buscar escolas"}
              </button>
            </div>

            <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <p>
                Segmento selecionado: <span className="font-semibold text-slate-800">{segmentLabel}</span>
              </p>
              <p>Ordenacao automatica por score de potencial comercial</p>
            </div>
          </div>

          <aside className="rounded-[28px] border border-cyan-200/40 bg-gradient-to-b from-sky-700/95 to-[#04345e] p-5 shadow-2xl shadow-slate-950/35">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Painel da busca</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/80">Leads encontrados</p>
                <p className="mt-2 text-3xl font-semibold">{results.length}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/80">Faixa predominante</p>
                <p className="mt-2 text-xl font-semibold">
                  {results.length > 0 ? scoreTone(results[0].ai_score).label : "Sem dados"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/80">Acoes rapidas</p>
                <button
                  className="mt-2 w-full rounded-xl border border-cyan-200/70 bg-cyan-200/20 px-3 py-2 text-sm font-medium transition hover:bg-cyan-200/30 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading || results.length === 0}
                  onClick={salvarTodosNoPipeline}
                  type="button"
                >
                  Salvar todos no pipeline
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 md:px-6">
        {toast && (
          <div className="mb-5 rounded-2xl border border-sky-200/40 bg-sky-950/40 px-4 py-3 text-sm text-sky-50 backdrop-blur-sm">
            {toast}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((item) => (
              <div
                className="animate-pulse rounded-3xl border border-white/10 bg-gradient-to-r from-sky-950/55 via-sky-900/50 to-sky-950/55 p-6"
                key={item}
              >
                <div className="h-5 w-44 rounded bg-white/20" />
                <div className="mt-4 h-3 w-72 rounded bg-white/15" />
                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="h-12 rounded-xl bg-white/10" />
                  <div className="h-12 rounded-xl bg-white/10" />
                  <div className="h-12 rounded-xl bg-white/10" />
                  <div className="h-12 rounded-xl bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-cyan-200/40 bg-sky-950/45 p-10 text-center">
            <h3 className="text-2xl font-semibold text-cyan-50">Pronto para mapear oportunidades?</h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-cyan-100/85">
              Selecione estado, cidade e segmento para gerar uma lista priorizada de escolas com dados de contato e estrategia sugerida.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {results.map((lead) => {
              const tone = scoreTone(lead.ai_score);
              const website = websiteHref(lead.website);
              const whatsapp = lead.phone_formatted
                ? `https://wa.me/${lead.phone_formatted.replace("+", "")}`
                : null;

              return (
                <article
                  className="rounded-3xl border border-cyan-100/20 bg-gradient-to-r from-sky-950/85 via-[#0c4f7f]/80 to-sky-950/85 p-5 shadow-xl shadow-slate-950/30"
                  key={lead.id}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-100/40 bg-cyan-200/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-cyan-50">
                          {lead.city ?? "Cidade nao informada"}
                          {lead.state ? ` · ${lead.state}` : ""}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.classes}`}>
                          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                          {tone.label}
                        </span>
                      </div>

                      <h3 className="mt-3 text-2xl font-semibold text-white">{lead.name}</h3>
                      <p className="mt-1 text-sm text-cyan-100/85">
                        INEP {lead.inep_code ?? "Nao informado"} · CNPJ {formatCnpj(lead.cnpj)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-center backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/80">Score</p>
                      <p className="mt-1 text-3xl font-semibold text-white">{lead.ai_score ?? 0}</p>
                      <p className="text-xs text-cyan-100/75">ICP {lead.icp_match ?? "baixo"}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/80">Telefone</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatPhone(lead.phone_number)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/80">Capital social</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatMoney(lead.capital_social)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/80">Tempo de operacao</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatYearsSince(lead.data_abertura)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/80">Matriculas INEP</p>
                      <p className="mt-1 text-sm font-semibold text-white">{lead.total_matriculas ?? "Nao informado"}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-cyan-200/35 bg-cyan-200/10 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/90">Abordagem sugerida</p>
                    <p className="mt-1 text-sm text-cyan-50">{lead.abordagem_sugerida ?? "Sem recomendacao"}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
                      href={`/escolas/${lead.inep_code ?? lead.id}`}
                    >
                      Abrir pagina da escola
                    </Link>
                    <button
                      className="rounded-xl border border-cyan-100/60 bg-cyan-200/20 px-3 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-200/30"
                      onClick={() => salvarNoPipeline(lead)}
                      type="button"
                    >
                      Salvar no pipeline
                    </button>
                    {whatsapp && (
                      <a
                        className="rounded-xl border border-emerald-200/70 bg-emerald-200/20 px-3 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-200/30"
                        href={whatsapp}
                        rel="noreferrer"
                        target="_blank"
                      >
                        WhatsApp
                      </a>
                    )}
                    {website && (
                      <a
                        className="rounded-xl border border-sky-200/70 bg-sky-200/20 px-3 py-2 text-sm font-medium text-sky-50 transition hover:bg-sky-200/30"
                        href={website}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Website
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
