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

function formatDateTime(value: string | null): string {
  if (!value) return "Nao sincronizado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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

function criterionColor(points: number, max: number): string {
  const ratio = max > 0 ? points / max : 0;
  if (ratio >= 0.75) return "bg-emerald-400";
  if (ratio >= 0.45) return "bg-amber-400";
  return "bg-rose-400";
}

function isPositiveStatus(value: string | null): boolean {
  const text = String(value ?? "").toLowerCase();
  return text.includes("ativa") || text.includes("ativo");
}

function qeduStatusLabel(status: EscolaProfile["qedu_status"]): string {
  if (status === "live") return "QEdu ao vivo";
  if (status === "cache") return "QEdu em cache";
  return "QEdu indisponivel";
}

type InfraIcon =
  | "internet"
  | "biblioteca"
  | "labInfo"
  | "labCiencia"
  | "quadra"
  | "leitura"
  | "acessibilidade"
  | "auditorio";

function icon(active: boolean, iconName: InfraIcon) {
  const common = active ? "text-[#BF00FF]" : "text-white/35";

  const iconNode = (() => {
    switch (iconName) {
      case "internet":
        return (
          <svg className={`h-5 w-5 ${common}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M2.5 9.5a14.8 14.8 0 0 1 19 0" />
            <path d="M5.5 13a10 10 0 0 1 13 0" />
            <path d="M8.8 16.2a5.4 5.4 0 0 1 6.4 0" />
            <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        );
      case "biblioteca":
        return (
          <svg className={`h-5 w-5 ${common}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M5 4.5h3.5V19H5z" />
            <path d="M10.2 4.5h3.5V19h-3.5z" />
            <path d="M15.4 6h3.5v13h-3.5z" />
          </svg>
        );
      case "labInfo":
        return (
          <svg className={`h-5 w-5 ${common}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <rect height="9" rx="1.5" width="14" x="5" y="4.5" />
            <path d="M10 17.5h4" />
            <path d="M8 20h8" />
          </svg>
        );
      case "labCiencia":
        return (
          <svg className={`h-5 w-5 ${common}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M9 4h6" />
            <path d="M10 4v5l-4 7a3 3 0 0 0 2.6 4.5h6.8A3 3 0 0 0 18 16l-4-7V4" />
          </svg>
        );
      case "quadra":
        return (
          <svg className={`h-5 w-5 ${common}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <rect height="14" rx="2" width="18" x="3" y="5" />
            <path d="M12 5v14" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        );
      case "leitura":
        return (
          <svg className={`h-5 w-5 ${common}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H11v15H6.5A2.5 2.5 0 0 0 4 21z" />
            <path d="M20 6.5A2.5 2.5 0 0 0 17.5 4H13v15h4.5A2.5 2.5 0 0 1 20 21z" />
          </svg>
        );
      case "acessibilidade":
        return (
          <svg className={`h-5 w-5 ${common}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <circle cx="12" cy="4.5" r="1.8" />
            <path d="M6 8h12" />
            <path d="M12 8v5" />
            <path d="M12 13l3 6" />
            <path d="M12 13l-3 6" />
          </svg>
        );
      case "auditorio":
        return (
          <svg className={`h-5 w-5 ${common}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M4 6h16l-2 12H6z" />
            <path d="M8 10h8" />
            <path d="M9 13h6" />
          </svg>
        );
      default:
        return null;
    }
  })();

  return (
    <span
      className={`flex h-11 w-11 items-center justify-center rounded-xl border text-lg ${
        active
          ? "border-[#BF00FF]/60 bg-[#BF00FF]/20 text-[#BF00FF]"
          : "border-white/15 bg-white/5 text-white/35"
      }`}
    >
      {iconNode}
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
          phone_number: profile.phone_formatted,
          phone_formatted: profile.phone_formatted,
          website: profile.website,
          email: profile.email,
          address: profile.address,
          bairro: profile.bairro,
          cep: profile.cep,
          latitude: profile.lat,
          longitude: profile.lng,
          cep_lat: profile.lat,
          cep_lng: profile.lng,
          capital_social: profile.capital_social,
          porte: profile.porte,
          data_abertura: profile.data_abertura,
          socios: profile.socios,
          total_matriculas: profile.total_matriculas,
          ideb_af: profile.ideb_af,
          ai_score: profile.ai_score,
          icp_match: profile.icp_match,
          pain_points: profile.pain_points,
          abordagem_sugerida: profile.abordagem_sugerida,
          source: profile.qedu_status === "live" ? "qedu_api" : "inep_censo",
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
            Voltar para busca
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

  const hasMap = profile.lat !== null && profile.lng !== null && !(profile.lat === 0 && profile.lng === 0);
  const scorePct = scorePercent(profile.ai_score);

  const infrastructureItems = [
    { label: "Internet", value: profile.tem_internet, icon: "internet" as const },
    { label: "Biblioteca", value: profile.tem_biblioteca, icon: "biblioteca" as const },
    { label: "Lab. Informatica", value: profile.tem_lab_informatica, icon: "labInfo" as const },
    { label: "Lab. Ciencias", value: profile.tem_lab_ciencias, icon: "labCiencia" as const },
    { label: "Quadra esportes", value: profile.tem_quadra, icon: "quadra" as const },
    { label: "Sala de leitura", value: profile.tem_sala_leitura, icon: "leitura" as const },
    { label: "Acessibilidade", value: profile.tem_acessibilidade, icon: "acessibilidade" as const },
    { label: "Auditorio", value: profile.tem_auditorio, icon: "auditorio" as const },
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
                  INEP: {profile.inep_code || "Nao informado"} | {profile.city ?? "-"}/{profile.state ?? "-"}
                </p>
                <p className="mt-1 font-[var(--font-manrope)] text-[12px] text-white/45">
                  {qeduStatusLabel(profile.qedu_status)} · ultimo sync {formatDateTime(profile.qedu_last_sync_at)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium">
                    {profile.school_segment}
                  </span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium">
                    {profile.dependencia_administrativa ?? (profile.is_private === "Sim" ? "Privada" : "Publica")}
                  </span>
                  <span className="rounded-full border border-emerald-300/40 bg-emerald-300/20 px-2.5 py-1 text-xs font-medium text-emerald-100">
                    {profile.situacao_funcionamento ?? (isPositiveStatus(profile.situacao_cadastral) ? "Ativa" : "Status nao confirmado")}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.phone_formatted && (
                    <a
                      className="rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-medium transition hover:bg-white/20"
                      href={`tel:${profile.phone_formatted}`}
                    >
                      Ligar
                    </a>
                  )}
                  {profile.website && (
                    <a
                      className="rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-medium transition hover:bg-white/20"
                      href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Site
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
            <p className="text-2xl">Pessoas</p>
            <p className="mt-2 text-2xl font-bold">{formatNumber(profile.total_matriculas)}</p>
            <p className="text-xs text-white/60">Matriculas</p>
          </article>
          <article className="rounded-xl border border-[#BF00FF]/20 bg-[#1b1027] p-4">
            <p className="text-2xl">Prof.</p>
            <p className="mt-2 text-2xl font-bold">{formatNumber(profile.total_professores)}</p>
            <p className="text-xs text-white/60">Professores</p>
          </article>
          <article className="rounded-xl border border-[#BF00FF]/20 bg-[#1b1027] p-4">
            <p className="text-2xl">Tempo</p>
            <p className="mt-2 text-2xl font-bold">{profile.anos_operacao ?? "-"}</p>
            <p className="text-xs text-white/60">Anos operando</p>
          </article>
          <article className="rounded-xl border border-[#BF00FF]/20 bg-[#1b1027] p-4">
            <p className="text-2xl">Capital</p>
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
              <p className="mt-4 text-xs text-white/45">Fonte: INEP | Censo Escolar 2025</p>
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
              <p className="text-sm text-white/60">Contato</p>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <p>
                  <span className="text-white/55">Telefone: </span>
                  <strong>{profile.phone_formatted ?? "Nao informado"}</strong>
                </p>
                <p>
                  <span className="text-white/55">Email: </span>
                  <strong>{profile.email ?? "Nao informado"}</strong>
                </p>
                <p className="md:col-span-2">
                  <span className="text-white/55">Site: </span>
                  <strong>{profile.website ?? "Nao informado"}</strong>
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm text-white/60">Localizacao</p>
              <div className="mt-2 grid gap-2 text-sm">
                <p>
                  <span className="text-white/55">Endereco: </span>
                  <strong>
                    {[profile.address, profile.bairro, profile.city, profile.state].filter(Boolean).join(", ") || "Nao informado"}
                  </strong>
                </p>
                <p>
                  <span className="text-white/55">CEP: </span>
                  <strong>{profile.cep ?? "Nao informado"}</strong>
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm text-white/60">Socios</p>
              <div className="mt-2 flex flex-col gap-2">
                {profile.socios.length === 0 && <p className="text-sm text-white/55">Nao informado</p>}
                {profile.socios.slice(0, 3).map((socio) => (
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm" key={`${socio.nome}-${socio.qualificacao}`}>
                    <strong>{socio.nome}</strong>
                    <span className="text-white/60"> | {socio.qualificacao}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

        <section className="rounded-xl border border-[#BF00FF]/30 bg-[rgba(191,0,255,0.08)] p-5">
          <h2 className="font-[var(--font-outfit)] text-xl font-semibold text-[#BF00FF]">Analise Wayzen</h2>

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

          <div className="mt-5 rounded-xl border border-white/15 bg-black/20 p-4">
            <p className="text-sm text-white/70">Como o ICP foi analisado para esta escola</p>
            <p className="mt-1 text-xs text-white/55">
              Segmento, faturamento estimado, dependencia de conversao, dados de contato e etapas de ensino.
            </p>

            {profile.icp_justificativa && (
              <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/75">
                {profile.icp_justificativa}
              </p>
            )}

            <div className="mt-4 grid gap-3">
              {(profile.icp_criteria ?? []).map((criterion) => {
                const pct = Math.max(0, Math.min(100, (criterion.points / criterion.max_points) * 100));
                return (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3" key={criterion.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{criterion.label}</p>
                      <p className="text-xs text-white/70">
                        {criterion.points}/{criterion.max_points}
                      </p>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/10">
                      <div className={`h-2 rounded-full ${criterionColor(criterion.points, criterion.max_points)}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-white/65">Escola: {criterion.school_value}</p>
                    <p className="mt-1 text-xs text-white/50">{criterion.analysis}</p>
                  </div>
                );
              })}
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
            Voltar para busca
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
              Ver no Google Maps
            </a>
          )}
        </footer>
      </div>
    </main>
  );
}
