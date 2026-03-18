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

type ToastState = {
  message: string;
  profileUrl?: string;
};

const SEGMENTS: SegmentOption[] = [
  { label: "Ensino Fundamental", cnae: "8513900" },
  { label: "Ensino Medio", cnae: "8520100" },
  { label: "Educacao Infantil", cnae: "8512100" },
  { label: "Creche", cnae: "8511200" },
  { label: "Ensino Tecnico", cnae: "8541400" },
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
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return "Nao informado";
}

function formatYearsSince(value: string | null): string {
  if (!value) return "Nao informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nao informado";
  const years = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)));
  if (years === 0) return "< 1 ano";
  if (years === 1) return "1 ano";
  return `${years} anos`;
}

function websiteHref(value: string | null): string | null {
  const site = String(value ?? "").trim();
  if (!site) return null;
  if (site.startsWith("http://") || site.startsWith("https://")) return site;
  return `https://${site}`;
}

function scoreTone(score: number | null): { label: string; classes: string } {
  const num = score ?? 0;
  if (num >= 65) return { label: "Alta prioridade", classes: "border-[#BF00FF] bg-[rgba(191,0,255,0.2)] text-[#F4C9FF]" };
  if (num >= 40) return { label: "Media prioridade", classes: "border-[#FF8C00] bg-[rgba(255,140,0,0.16)] text-[#FFD6A1]" };
  return { label: "Baixa prioridade", classes: "border-[#FF0080] bg-[rgba(255,0,128,0.16)] text-[#FFC4E2]" };
}

export default function BuscarPage() {
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [cnae, setCnae] = useState(SEGMENTS[0].cnae);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUfs, setIsLoadingUfs] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [results, setResults] = useState<SchoolLead[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [ufs, setUfs] = useState<UfOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [savedProfiles, setSavedProfiles] = useState<Record<string, string>>({});

  const segmentLabel = useMemo(() => SEGMENTS.find((s) => s.cnae === cnae)?.label ?? "", [cnae]);

  useEffect(() => {
    let isMounted = true;
    async function loadUfs() {
      setIsLoadingUfs(true);
      try {
        const response = await fetch("/api/localidades/ufs", { cache: "no-store" });
        const payload = (await response.json()) as UfOption[];
        if (isMounted && Array.isArray(payload)) {
          setUfs([...payload].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
        }
      } catch {
        if (isMounted) setToast({ message: "Falha ao carregar estados." });
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
        const response = await fetch(`/api/localidades/cidades?uf=${estado}`, { cache: "no-store" });
        const payload = (await response.json()) as CityOption[];
        if (isMounted && Array.isArray(payload)) {
          setCities([...payload].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
        }
      } catch {
        if (isMounted) {
          setCities([]);
          setToast({ message: "Falha ao carregar cidades." });
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
      setToast({ message: "Selecione estado e cidade para buscar." });
      return;
    }

    setIsLoading(true);
    setToast(null);
    setSavedProfiles({});

    try {
      const response = await fetch("/api/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, cidade, cnae }),
      });
      const payload = (await response.json()) as SchoolLead[] | { error?: string };
      if (!response.ok) {
        setResults([]);
        setToast({ message: (payload as { error?: string }).error ?? "Erro ao buscar escolas." });
        return;
      }
      const list = Array.isArray(payload) ? payload : [];
      setResults(list);
      if (list.length === 0) {
        setToast({ message: "Nenhum resultado encontrado para esta busca." });
      }
    } catch (error) {
      setToast({ message: `Erro ao buscar: ${String(error)}` });
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function salvarNoPipeline(lead: SchoolLead): Promise<{ ok: boolean; profileUrl?: string }> {
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        setToast({ message: payload.error ?? "Falha ao salvar lead." });
        return { ok: false };
      }

      const savedId = String(payload.id ?? lead.id);
      const profileUrl = `/escolas/${savedId}`;
      setSavedProfiles((prev) => ({ ...prev, [lead.id]: savedId }));
      setToast({ message: `${lead.name} salvo no pipeline.`, profileUrl });
      return { ok: true, profileUrl };
    } catch (error) {
      setToast({ message: `Erro ao salvar lead: ${String(error)}` });
      return { ok: false };
    }
  }

  async function salvarTodosNoPipeline() {
    if (results.length === 0) return;
    setIsLoading(true);

    let ok = 0;
    let fail = 0;
    let lastProfileUrl: string | undefined;

    for (const lead of results) {
      const result = await salvarNoPipeline(lead);
      if (result.ok) {
        ok += 1;
        lastProfileUrl = result.profileUrl ?? lastProfileUrl;
      } else {
        fail += 1;
      }
    }

    setIsLoading(false);
    setToast({
      message: `${ok} escolas salvas no pipeline${fail ? ` (${fail} com falha)` : ""}.`,
      profileUrl: lastProfileUrl,
    });
  }

  return (
    <main className="wayzen-page pb-16 text-white">
      <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
        <div className="wayzen-card p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Busca Comercial</p>
          <h1 className="mt-3 font-[var(--font-outfit)] text-3xl font-bold md:text-5xl">
            Descubra escolas com maior potencial de conversao
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-white/70 md:text-base">
            Busca por cidade + segmento, score heuristico e priorizacao automatica para seu pipeline.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <select
              className="wayzen-input px-3 py-3 text-sm"
              disabled={isLoadingUfs}
              onChange={(e) => setEstado(e.target.value)}
              value={estado}
            >
              <option className="bg-[#14071f]" value="">
                {isLoadingUfs ? "Carregando estados..." : "Selecione o estado"}
              </option>
              {ufs.map((uf) => (
                <option className="bg-[#14071f]" key={uf.sigla} value={uf.sigla}>
                  {uf.nome} ({uf.sigla})
                </option>
              ))}
            </select>

            <select
              className="wayzen-input px-3 py-3 text-sm"
              disabled={!estado || isLoadingCities}
              onChange={(e) => setCidade(e.target.value)}
              value={cidade}
            >
              <option className="bg-[#14071f]" value="">
                {!estado ? "Selecione o estado primeiro" : isLoadingCities ? "Carregando cidades..." : "Selecione a cidade"}
              </option>
              {cities.map((city) => (
                <option className="bg-[#14071f]" key={city.nome} value={city.nome}>
                  {city.nome}
                </option>
              ))}
            </select>

            <select
              className="wayzen-input px-3 py-3 text-sm"
              onChange={(e) => setCnae(e.target.value)}
              value={cnae}
            >
              {SEGMENTS.map((segment) => (
                <option className="bg-[#14071f]" key={segment.cnae} value={segment.cnae}>
                  {segment.label} ({segment.cnae})
                </option>
              ))}
            </select>

            <button
              className="wayzen-btn-primary px-4 py-3 text-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              onClick={handleBuscar}
              type="button"
            >
              {isLoading ? "Buscando..." : "Buscar escolas"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white/65">
            <p>Segmento selecionado: <span className="font-semibold text-white/90">{segmentLabel}</span></p>
            <p>Resultados retornam ordenados por score.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 md:px-6">
        {toast && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.75)] px-4 py-3 text-sm text-white/95">
            <span>{toast.message}</span>
            {toast.profileUrl && (
              <Link className="rounded-lg border border-[var(--wayzen-purple)] px-2 py-1 text-xs font-semibold text-[#F0B2FF] hover:bg-[rgba(191,0,255,0.18)]" href={toast.profileUrl}>
                Ver perfil →
              </Link>
            )}
          </div>
        )}

        {results.length > 0 && !isLoading && (
          <div className="mb-4 rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.45)] px-4 py-3 text-sm text-white/85">
            {results.length} escolas encontradas · ordenadas por score
            <button
              className="ml-3 rounded-lg border border-[var(--wayzen-border)] bg-[rgba(191,0,255,0.2)] px-3 py-1 text-xs font-semibold text-white hover:bg-[rgba(191,0,255,0.3)]"
              disabled={isLoading}
              onClick={salvarTodosNoPipeline}
              type="button"
            >
              Salvar todos no pipeline
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div
                className="animate-pulse rounded-2xl border border-[rgba(191,0,255,0.35)] bg-[linear-gradient(120deg,rgba(39,39,87,0.6),rgba(191,0,255,0.12),rgba(39,39,87,0.6))] p-5"
                key={item}
              >
                <div className="h-5 w-52 rounded bg-white/20" />
                <div className="mt-3 h-3 w-64 rounded bg-white/15" />
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="h-12 rounded-xl bg-white/10" />
                  <div className="h-12 rounded-xl bg-white/10" />
                  <div className="h-12 rounded-xl bg-white/10" />
                  <div className="h-12 rounded-xl bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.32)] p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--wayzen-border)] bg-[rgba(191,0,255,0.16)]">
              <span className="text-2xl">⌕</span>
            </div>
            <h3 className="mt-4 font-[var(--font-outfit)] text-2xl font-semibold">Nenhuma busca ativa</h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-white/70">
              Selecione estado, cidade e segmento para listar escolas com score comercial, CNPJ, contato e sugestao de abordagem.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((lead) => {
              const tone = scoreTone(lead.ai_score);
              const website = websiteHref(lead.website);
              const tel = lead.phone_formatted ? `tel:${lead.phone_formatted}` : null;
              const savedId = savedProfiles[lead.id];

              return (
                <article className="wayzen-card p-5" key={lead.id}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px]">
                          {lead.city ?? "Cidade nao informada"}{lead.state ? ` · ${lead.state}` : ""}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.classes}`}>
                          {tone.label}
                        </span>
                      </div>

                      <h3 className="mt-3 font-[var(--font-outfit)] text-2xl font-semibold text-white">{lead.name}</h3>
                      <p className="mt-1 text-sm text-white/75">
                        INEP {lead.inep_code ?? "Nao informado"} · CNPJ {formatCnpj(lead.cnpj)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.55)] px-4 py-3 text-center">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-white/70">Score</p>
                      <p className="mt-1 font-[var(--font-outfit)] text-3xl font-bold text-white">{lead.ai_score ?? 0}</p>
                      <p className="text-xs text-white/70">ICP {lead.icp_match ?? "baixo"}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-white/15 bg-white/[0.05] p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">Telefone</p>
                      {tel ? (
                        <a className="mt-1 block text-sm font-semibold text-white hover:text-[#F0B2FF]" href={tel}>
                          {formatPhone(lead.phone_number)}
                        </a>
                      ) : (
                        <p className="mt-1 text-sm font-semibold text-white">{formatPhone(lead.phone_number)}</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-white/15 bg-white/[0.05] p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">Capital social</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatMoney(lead.capital_social)}</p>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-white/[0.05] p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">Anos de operacao</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatYearsSince(lead.data_abertura)}</p>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-white/[0.05] p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">Matriculas INEP</p>
                      <p className="mt-1 text-sm font-semibold text-white">{lead.total_matriculas ?? "Nao informado"}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-[var(--wayzen-border)] bg-[rgba(191,0,255,0.08)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Abordagem sugerida</p>
                    <p className="mt-1 text-sm text-white/90">{lead.abordagem_sugerida ?? "Sem recomendacao"}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20"
                      href={`/escolas/${lead.inep_code ?? lead.id}`}
                    >
                      Abrir pagina da escola
                    </Link>
                    <button
                      className="wayzen-btn-primary px-3 py-2 text-sm hover:brightness-110"
                      onClick={() => salvarNoPipeline(lead)}
                      type="button"
                    >
                      + Salvar no Pipeline
                    </button>
                    {savedId && (
                      <Link
                        className="rounded-lg border border-[#BF00FF] bg-[rgba(191,0,255,0.2)] px-3 py-2 text-sm font-semibold text-[#F0B2FF] hover:bg-[rgba(191,0,255,0.3)]"
                        href={`/escolas/${savedId}`}
                      >
                        Ver perfil →
                      </Link>
                    )}
                    {website && (
                      <a
                        className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20"
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

