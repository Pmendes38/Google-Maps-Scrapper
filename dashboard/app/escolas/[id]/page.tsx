"use client";

import Link from "next/link";
import { Manrope, Outfit } from "next/font/google";
import { useEffect, useMemo, useState } from "react";

import { SchoolMap } from "@/components/SchoolMap";
import type { EscolaProfile, PipelineStage } from "@/lib/types";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

const PIPELINE_STAGES: PipelineStage[] = [
  "Novo",
  "Qualificado",
  "1° Contato",
  "Proposta Enviada",
  "Ganho",
  "Perdido",
];

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value || "Nao informado";
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatCurrency(value: number | null): string {
  if (!value || value <= 0) return "Nao informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "Nao informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function scoreColor(score: number | null): string {
  const value = score ?? 0;
  if (value >= 65) return "bg-emerald-400";
  if (value >= 40) return "bg-amber-400";
  return "bg-rose-400";
}

function idebColor(value: number | null): string {
  const score = value ?? 0;
  if (score > 6) return "bg-emerald-400";
  if (score >= 4) return "bg-amber-400";
  return "bg-rose-400";
}

function percentBar(value: number | null): number {
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(100, value));
}

function scorePercent(value: number | null): number {
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(100, value));
}

function isPositiveStatus(value: string | null): boolean {
  const text = String(value ?? "").toLowerCase();
  return text.includes("ativa") || text.includes("ativo");
}

function icon(active: boolean, children: React.ReactNode) {
  return (
    <span
      className={`flex h-11 w-11 items-center justify-center rounded-xl border text-lg ${
        active
          ? "border-[#BF00FF]/60 bg-[#BF00FF]/20 text-[#BF00FF]"
          : "border-white/15 bg-white/5 text-white/35"
      }`}
    >
      {children}
    </span>
  );
}

function copyText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return Promise.resolve(false);
  return navigator.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false);
}

export default function EscolaPage({ params }: { params: { id: string } }) {
  const [profile, setProfile] = useState<EscolaProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setLoading(true);
      try {
        const response = await fetch(`/api/escola-profile/${params.id}`, { cache: "no-store" });
        const payload = (await response.json()) as EscolaProfile | { error?: string };

        if (!response.ok) {
          if (isMounted) {
            setError((payload as { error?: string }).error ?? "Falha ao carregar perfil da escola");
            setProfile(null);
          }
          return;
        }

        if (isMounted) {
          setProfile(payload as EscolaProfile);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(String(err));
          setProfile(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [params.id]);

  const googleMapsUrl = useMemo(() => {
    if (!profile) return null;
    if (profile.lat !== null && profile.lng !== null) {
      return `https://www.google.com/maps?q=${profile.lat},${profile.lng}`;
    }

    const address = [profile.address, profile.bairro, profile.city, profile.state]
      .filter(Boolean)
      .join(", ");
    if (!address) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }, [profile]);

  async function updatePipelineStage(nextStage: PipelineStage) {
    if (!profile) return;
    setUpdatingStage(true);

    try {
      const response = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id, pipeline_stage: nextStage }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setToast(payload.error ?? "Nao foi possivel atualizar etapa do pipeline.");
      } else {
        setProfile((prev) => (prev ? { ...prev, pipeline_stage: nextStage } : prev));
        setToast("Etapa do pipeline atualizada.");
      }
    } catch (err) {
      setToast(String(err));
    } finally {
      setUpdatingStage(false);
      setTimeout(() => setToast(null), 2600);
    }
  }

  async function saveToPipeline() {
    if (!profile) return;
    setSaving(true);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: profile.id,
          place_id: profile.inep_code || profile.cnpj || profile.id,
          inep_code: profile.inep_code,
          name: profile.name,
          city: profile.city,
          state: profile.state,
          cnpj: profile.cnpj,
          razao_social: profile.razao_social,
          school_segment: profile.school_segment,
          is_private: profile.is_private,
          phone_formatted: profile.phone_formatted,
          website: profile.website,
          email: profile.email,
          address: profile.address,
          bairro: profile.bairro,
          cep: profile.cep,
          capital_social: profile.capital_social,
          porte: profile.porte,
          data_abertura: profile.data_abertura,
          total_matriculas: profile.total_matriculas,
          ideb_af: profile.ideb_af,
          ai_score: profile.ai_score,
          icp_match: profile.icp_match,
          pain_points: profile.pain_points,
          abordagem_sugerida: profile.abordagem_sugerida,
          source: "inep_censo",
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setToast(payload.error ?? "Falha ao salvar no pipeline.");
      } else {
        setToast("Lead salvo no pipeline.");
      }
    } catch (err) {
      setToast(String(err));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2600);
    }
  }

  async function copyToWhatsapp() {
    if (!profile) return;
    const text = `${profile.name}\n${profile.abordagem_sugerida ?? "Sem abordagem sugerida."}`;
    const ok = await copyText(text);
    setToast(ok ? "Texto copiado para WhatsApp." : "Nao foi possivel copiar o texto.");
    setTimeout(() => setToast(null), 2600);
  }

  if (loading) {
    return (
      <main className={`${outfit.variable} ${manrope.variable} min-h-screen bg-[#0D0012] px-6 py-10 text-white`}>
        <div className="mx-auto max-w-[1100px]">
          <p className="font-[var(--font-manrope)] text-sm text-white/65">Carregando perfil da escola...</p>
        </div>
      </main>
    );
  }

  if (!profile || error) {
    return (
      <main className={`${outfit.variable} ${manrope.variable} min-h-screen bg-[#0D0012] px-6 py-10 text-white`}>
        <div className="mx-auto max-w-[1100px] rounded-2xl border border-rose-300/30 bg-rose-400/10 p-6">
          <h1 className="font-[var(--font-outfit)] text-2xl font-semibold">Perfil da escola</h1>
          <p className="mt-3 font-[var(--font-manrope)] text-sm text-rose-100/90">
            {error ?? "Escola nao encontrada"}
          </p>
          <Link
            className="mt-4 inline-flex rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15"
            href="/buscar"
          >
            ← Voltar para busca
          </Link>
        </div>
      </main>
    );
  }

  const showPerformance =
    profile.ideb_ai !== null ||
    profile.ideb_af !== null ||
    profile.taxa_aprovacao !== null ||
    profile.taxa_reprovacao !== null ||
    profile.taxa_abandono !== null;

  const hasCnpj = Boolean(profile.cnpj);
  const hasMap = profile.lat !== null && profile.lng !== null;
  const scorePct = scorePercent(profile.ai_score);

  const infrastructureItems = [
    { label: "Internet", value: profile.tem_internet, icon: "🌐" },
    { label: "Biblioteca", value: profile.tem_biblioteca, icon: "📚" },
    { label: "Lab. Informatica", value: profile.tem_lab_informatica, icon: "💻" },
    { label: "Lab. Ciencias", value: profile.tem_lab_ciencias, icon: "🔬" },
    { label: "Quadra esportes", value: profile.tem_quadra, icon: "🏟️" },
    { label: "Sala de leitura", value: profile.tem_sala_leitura, icon: "📖" },
    { label: "Acessibilidade", value: profile.tem_acessibilidade, icon: "♿" },
    { label: "Auditorio", value: profile.tem_auditorio, icon: "🎭" },
  ];

  return (
    <main className={`${outfit.variable} ${manrope.variable} min-h-screen bg-[#0D0012] px-6 py-6 text-white`}>
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
        <section className="rounded-2xl border border-[#BF00FF]/25 bg-[rgba(39,39,87,0.5)] px-6 py-7 shadow-lg shadow-black/25 md:px-8">
          <div className="flex flex-col gap-5 border-b border-[rgba(191,0,255,0.2)] pb-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#BF00FF] text-2xl font-semibold text-white">
                {profile.name.slice(0, 1).toUpperCase()}
              </div>

              <div className="min-w-0">
                <h1 className="font-[var(--font-outfit)] text-2xl font-bold text-white md:text-[30px]">
                  {profile.name}
                </h1>
                <p className="mt-1 font-[var(--font-manrope)] text-[13px] text-white/55">
                  INEP: {profile.inep_code || "Nao informado"} · {profile.city ?? "-"}/{profile.state ?? "-"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium">
                    {profile.school_segment}
                  </span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium">
                    {profile.is_private === "Sim" ? "Privada" : "Publica"}
                  </span>
                  <span className="rounded-full border border-emerald-300/40 bg-emerald-300/20 px-2.5 py-1 text-xs font-medium text-emerald-100">
                    {isPositiveStatus(profile.situacao_cadastral) ? "Ativa" : "Status nao confirmado"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.phone_formatted && (
                    <a
                      className="rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-medium transition hover:bg-white/20"
                      href={`tel:${profile.phone_formatted}`}
                    >
                      📞 Ligar
                    </a>
                  )}
                  {profile.website && (
                    <a
                      className="rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-medium transition hover:bg-white/20"
                      href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      🌐 Site
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full max-w-[280px] rounded-2xl border border-[#BF00FF]/35 bg-[#1a0b29] p-4 md:w-[280px]">
              <p className="font-[var(--font-manrope)] text-[11px] uppercase tracking-[0.12em] text-white/60">Score comercial</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-[var(--font-outfit)] text-4xl font-bold text-white">{profile.ai_score ?? 0}</p>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold uppercase text-white/90">
                  {profile.icp_match ?? "baixo"}
                </span>
              </div>

              <select
                className="mt-4 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none transition focus:border-[#BF00FF]"
                disabled={updatingStage}
                onChange={(event) => updatePipelineStage(event.target.value as PipelineStage)}
                value={profile.pipeline_stage}
              >
                {PIPELINE_STAGES.map((stage) => (
                  <option className="bg-[#16061f]" key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>

              {!profile.pipeline_stage && (
                <button
                  className="mt-3 w-full rounded-xl bg-[#BF00FF] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#a200d8]"
                  disabled={saving}
                  onClick={saveToPipeline}
                  type="button"
                >
                  + Salvar no Pipeline
                </button>
              )}
            </div>
          </div>
        </section>

        {toast && (
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-[var(--font-manrope)] text-sm text-white/90">
            {toast}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-[#BF00FF]/20 bg-[#1b1027] p-4">
            <p className="text-2xl">👥</p>
            <p className="mt-2 text-2xl font-bold">{formatNumber(profile.total_matriculas)}</p>
            <p className="text-xs text-white/60">Matriculas</p>
          </article>
          <article className="rounded-xl border border-[#BF00FF]/20 bg-[#1b1027] p-4">
            <p className="text-2xl">👨‍🏫</p>
            <p className="mt-2 text-2xl font-bold">{formatNumber(profile.total_professores)}</p>
            <p className="text-xs text-white/60">Professores</p>
          </article>
          <article className="rounded-xl border border-[#BF00FF]/20 bg-[#1b1027] p-4">
            <p className="text-2xl">📅</p>
            <p className="mt-2 text-2xl font-bold">{profile.anos_operacao ?? "-"}</p>
            <p className="text-xs text-white/60">Anos operando</p>
          </article>
          <article className="rounded-xl border border-[#BF00FF]/20 bg-[#1b1027] p-4">
            <p className="text-2xl">💰</p>
            <p className="mt-2 text-2xl font-bold">{formatCurrency(profile.capital_social)}</p>
            <p className="text-xs text-white/60">Capital social</p>
          </article>
        </section>

        {showPerformance && (
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-white/15 bg-[#130a1d] p-5">
              <h2 className="font-[var(--font-outfit)] text-lg font-semibold">IDEB</h2>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-white/80">
                    <span>Anos iniciais</span>
                    <span>{profile.ideb_ai ?? "-"}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className={`h-2 rounded-full ${idebColor(profile.ideb_ai)}`}
                      style={{ width: `${Math.max(0, Math.min(100, (profile.ideb_ai ?? 0) * 10))}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-white/80">
                    <span>Anos finais</span>
                    <span>{profile.ideb_af ?? "-"}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className={`h-2 rounded-full ${idebColor(profile.ideb_af)}`}
                      style={{ width: `${Math.max(0, Math.min(100, (profile.ideb_af ?? 0) * 10))}%` }}
                    />
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-white/45">Fonte: INEP · Censo Escolar 2025</p>
            </article>

            <article className="rounded-xl border border-white/15 bg-[#130a1d] p-5">
              <h2 className="font-[var(--font-outfit)] text-lg font-semibold">Rendimento escolar</h2>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-white/80">
                    <span>Aprovacao</span>
                    <span>{profile.taxa_aprovacao ?? "-"}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${percentBar(profile.taxa_aprovacao)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-white/80">
                    <span>Reprovacao</span>
                    <span>{profile.taxa_reprovacao ?? "-"}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-amber-400" style={{ width: `${percentBar(profile.taxa_reprovacao)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm text-white/80">
                    <span>Abandono</span>
                    <span>{profile.taxa_abandono ?? "-"}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-rose-400" style={{ width: `${percentBar(profile.taxa_abandono)}%` }} />
                  </div>
                </div>
              </div>
            </article>
          </section>
        )}

        <section className="rounded-xl border border-white/15 bg-[#130a1d] p-5">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="font-[var(--font-outfit)] text-lg font-semibold">Infraestrutura</h2>
            <span className="text-xs text-white/45">Fonte: INEP</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {infrastructureItems.map((item) => (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3" key={item.label}>
                {icon(item.value, item.icon)}
                <p className={`mt-2 text-sm ${item.value ? "text-white" : "text-white/35"}`}>{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        {hasCnpj && (
          <section className="rounded-xl border border-white/15 bg-[#130a1d] p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="font-[var(--font-outfit)] text-lg font-semibold">Dados Empresariais</h2>
              <span className="text-xs text-white/45">Fonte: Receita Federal</span>
            </div>

            <div className="grid gap-3 text-sm md:grid-cols-2">
              <p>
                <span className="text-white/55">CNPJ: </span>
                <strong>{formatCnpj(profile.cnpj)}</strong>
              </p>
              <p>
                <span className="text-white/55">Razao social: </span>
                <strong>{profile.razao_social ?? "Nao informado"}</strong>
              </p>
              <p>
                <span className="text-white/55">Situacao: </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isPositiveStatus(profile.situacao_cadastral)
                      ? "bg-emerald-400/25 text-emerald-100"
                      : "bg-rose-400/25 text-rose-100"
                  }`}
                >
                  {profile.situacao_cadastral ?? "Nao informado"}
                </span>
              </p>
              <p>
                <span className="text-white/55">Porte: </span>
                <strong>{profile.porte ?? "Nao informado"}</strong>
              </p>
              <p>
                <span className="text-white/55">Capital: </span>
                <strong>{formatCurrency(profile.capital_social)}</strong>
              </p>
              <p>
                <span className="text-white/55">Abertura: </span>
                <strong>
                  {formatDate(profile.data_abertura)}
                  {profile.anos_operacao !== null ? ` (${profile.anos_operacao} anos)` : ""}
                </strong>
              </p>
            </div>

            <div className="mt-4">
              <p className="text-sm text-white/60">Socios</p>
              <div className="mt-2 flex flex-col gap-2">
                {profile.socios.length === 0 && <p className="text-sm text-white/55">Nao informado</p>}
                {profile.socios.slice(0, 3).map((socio) => (
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm" key={`${socio.nome}-${socio.qualificacao}`}>
                    <strong>{socio.nome}</strong>
                    <span className="text-white/60"> · {socio.qualificacao}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-[#BF00FF]/30 bg-[rgba(191,0,255,0.08)] p-5">
          <h2 className="font-[var(--font-outfit)] text-xl font-semibold text-[#BF00FF]">✦ Analise Wayzen</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-white/70">ICP Match</p>
              <span className="mt-1 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-semibold uppercase">
                {profile.icp_match ?? "baixo"}
              </span>
            </div>

            <div>
              <p className="text-sm text-white/70">Score</p>
              <div className="mt-1 h-2.5 rounded-full bg-white/10">
                <div
                  className={`h-2.5 rounded-full ${scoreColor(profile.ai_score)}`}
                  style={{ width: `${scorePct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-white/55">{profile.ai_score ?? 0}/100</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm text-white/70">Pain points identificados</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(profile.pain_points ?? []).length === 0 && (
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/60">
                  Nenhum pain point registrado
                </span>
              )}
              {(profile.pain_points ?? []).map((point) => (
                <span
                  className="rounded-full border border-fuchsia-300/40 bg-fuchsia-300/20 px-3 py-1 text-xs text-fuchsia-100"
                  key={point}
                >
                  {point}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/15 bg-black/20 p-4">
            <p className="text-sm text-white/70">Abordagem sugerida</p>
            <p className="mt-2 italic text-white/90">"{profile.abordagem_sugerida ?? "Sem abordagem sugerida."}"</p>
            <button
              className="mt-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
              onClick={copyToWhatsapp}
              type="button"
            >
              Copiar para WhatsApp
            </button>
          </div>
        </section>

        {hasMap && (
          <section className="rounded-xl border border-white/15 bg-[#130a1d] p-5">
            <h2 className="mb-4 font-[var(--font-outfit)] text-lg font-semibold">Mapa</h2>
            <SchoolMap
              height="280px"
              marker={{
                lat: profile.lat!,
                lng: profile.lng!,
                name: profile.name,
                city: profile.city,
                state: profile.state,
                score: profile.ai_score,
                icp: profile.icp_match,
              }}
              zoom={15}
            />
          </section>
        )}

        <footer className="mt-2 flex flex-wrap items-center gap-2 pb-8">
          <Link
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
            href="/buscar"
          >
            ← Voltar para busca
          </Link>

          <button
            className="rounded-xl bg-[#BF00FF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a200d8] disabled:opacity-50"
            disabled={saving}
            onClick={saveToPipeline}
            type="button"
          >
            + Salvar no Pipeline
          </button>

          {googleMapsUrl && (
            <a
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
              href={googleMapsUrl}
              rel="noreferrer"
              target="_blank"
            >
              🔗 Ver no Google Maps
            </a>
          )}
        </footer>
      </div>
    </main>
  );
}
