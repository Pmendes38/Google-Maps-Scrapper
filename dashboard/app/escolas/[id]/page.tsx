"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ScoreBadge } from "@/components/ScoreBadge";

type EscolaDetalhe = {
  inep_code: string;
  name: string;
  city: string | null;
  state: string | null;
  cnpj: string | null;
  razao_social: string | null;
  capital_social: number | null;
  porte: string | null;
  cnae_descricao: string | null;
  data_abertura: string | null;
  email: string | null;
  phone_number: string | null;
  phone_formatted: string | null;
  address: string | null;
  bairro: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  total_matriculas: number | null;
  matriculas_infantil: number | null;
  matriculas_fundamental: number | null;
  matriculas_medio: number | null;
  ideb_ai: number | null;
  ideb_af: number | null;
  tem_internet: boolean;
  tem_lab_informatica: boolean;
  ai_score: number;
  icp_match: "alto" | "medio" | "baixo";
  justificativa_score: string;
};

export default function EscolaPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<EscolaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/escolas/${params.id}`, { cache: "no-store" });
        const payload = (await response.json()) as EscolaDetalhe | { error?: string };

        if (!response.ok) {
          if (isMounted) {
            setError((payload as { error?: string }).error ?? "Falha ao carregar escola");
            setData(null);
          }
          return;
        }

        if (isMounted) {
          setData(payload as EscolaDetalhe);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(String(err));
          setData(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [params.id]);

  async function salvarNoPipeline() {
    if (!data) return;
    setSaving(true);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data.inep_code,
          place_id: data.inep_code,
          inep_code: data.inep_code,
          name: data.name,
          city: data.city,
          state: data.state,
          cnpj: data.cnpj,
          razao_social: data.razao_social,
          school_segment: "ed. basica",
          is_private: "Sim",
          phone_number: data.phone_number,
          phone_formatted: data.phone_formatted,
          email: data.email,
          address: data.address,
          bairro: data.bairro,
          cep: data.cep,
          capital_social: data.capital_social,
          porte: data.porte,
          cnae_descricao: data.cnae_descricao,
          data_abertura: data.data_abertura,
          total_matriculas: data.total_matriculas,
          ideb_af: data.ideb_af,
          ai_score: data.ai_score,
          icp_match: data.icp_match,
          justificativa_score: data.justificativa_score,
          source: "inep_censo",
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setToast(payload.error ?? "Falha ao salvar no pipeline");
      } else {
        setToast("Lead salvo no pipeline com sucesso.");
      }
    } catch (err) {
      setToast(String(err));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-gray-600">Carregando dados da escola...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Escola</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error ?? "Escola não encontrada"}</p>
        <Link className="mt-4 inline-block rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:border-gray-400" href="/buscar">
          Voltar para busca
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{data.name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            INEP: {data.inep_code} · {data.city ?? "-"}{data.state ? `/${data.state}` : ""}
          </p>
        </div>
        <ScoreBadge icp={data.icp_match} score={data.ai_score} />
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Qualificação do Lead</h2>
          <p className="text-sm">ICP Match: <strong>{data.icp_match}</strong></p>
          <p className="text-sm">Score: <strong>{data.ai_score}</strong></p>
          <p className="mt-2 text-sm text-gray-700">{data.justificativa_score}</p>
          <button
            className="mt-4 rounded-lg border border-gray-300 bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
            disabled={saving}
            onClick={salvarNoPipeline}
            type="button"
          >
            {saving ? "Salvando..." : "+ Salvar no Pipeline"}
          </button>
          {toast && <p className="mt-2 text-xs text-gray-600">{toast}</p>}
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Dados Coletados das APIs</h2>
          <p className="text-sm">CNPJ: {data.cnpj ?? "-"}</p>
          <p className="text-sm">Razão social: {data.razao_social ?? "-"}</p>
          <p className="text-sm">Porte: {data.porte ?? "-"}</p>
          <p className="text-sm">Capital social: {data.capital_social ?? "-"}</p>
          <p className="text-sm">CNAE: {data.cnae_descricao ?? "-"}</p>
          <p className="text-sm">Data abertura: {data.data_abertura ?? "-"}</p>
          <p className="text-sm">Email: {data.email ?? "-"}</p>
          <p className="text-sm">Telefone: {data.phone_number ?? "-"}</p>
          <p className="text-sm">Endereço: {data.address ?? "-"}</p>
          <p className="text-sm">Bairro: {data.bairro ?? "-"}</p>
          <p className="text-sm">CEP: {data.cep ?? "-"}</p>
        </article>
      </section>

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Dados INEP</h2>
        <p className="text-sm">Matrículas totais: {data.total_matriculas ?? "-"}</p>
        <p className="text-sm">Matrículas infantil: {data.matriculas_infantil ?? "-"}</p>
        <p className="text-sm">Matrículas fundamental: {data.matriculas_fundamental ?? "-"}</p>
        <p className="text-sm">Matrículas médio: {data.matriculas_medio ?? "-"}</p>
        <p className="text-sm">IDEB AI: {data.ideb_ai ?? "-"}</p>
        <p className="text-sm">IDEB AF: {data.ideb_af ?? "-"}</p>
        <p className="text-sm">Tem internet: {data.tem_internet ? "Sim" : "Não"}</p>
        <p className="text-sm">Tem laboratório de informática: {data.tem_lab_informatica ? "Sim" : "Não"}</p>
      </section>

      <div className="mt-6">
        <Link className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:border-gray-400" href="/buscar">
          Voltar para busca
        </Link>
      </div>
    </main>
  );
}
