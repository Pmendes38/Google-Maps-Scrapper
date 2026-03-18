import type { ICPMatch, Prioridade, SchoolSegment } from "@/lib/types";

export type IcpFitInput = {
  schoolSegment: SchoolSegment | string | null;
  isPrivate: boolean;
  totalMatriculas: number | null;
  matriculasInfantil: number | null;
  matriculasFundamental: number | null;
  matriculasMedio: number | null;
  hasPhone: boolean;
  hasAddressOrWebsite: boolean;
  estimatedRevenue: number | null;
};

export type IcpFitResult = {
  score: number;
  icpMatch: ICPMatch;
  prioridade: Prioridade;
  justificativa: string;
  abordagem: string;
  painPoints: string[];
  estimatedRevenue: number;
  dimensions: {
    d1Segmento: number;
    d2Faturamento: number;
    d3DependenciaConversao: number;
    d4Contato: number;
    d5Etapas: number;
  };
};

const TICKET_REGIONAL = 700;

function normalizeSegment(segment: IcpFitInput["schoolSegment"]): string {
  return String(segment ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function isLikelyInepFlagInput(input: IcpFitInput): boolean {
  const total = toNumber(input.totalMatriculas);
  const inf = toNumber(input.matriculasInfantil);
  const fund = toNumber(input.matriculasFundamental);
  const med = toNumber(input.matriculasMedio);
  const nonZero = [total, inf, fund, med].filter((value) => value > 0);
  if (nonZero.length === 0) return false;
  return total <= 1 && nonZero.every((value) => value <= 1);
}

function getEstimatedRevenue(input: IcpFitInput): number {
  const explicitRevenue = toNumber(input.estimatedRevenue);
  if (explicitRevenue > 0) return explicitRevenue;
  if (isLikelyInepFlagInput(input)) return 0;
  const students = toNumber(input.totalMatriculas);
  return students > 0 ? students * TICKET_REGIONAL : 0;
}

function getSegmentScore(input: IcpFitInput): number {
  const total = toNumber(input.totalMatriculas);
  const inf = toNumber(input.matriculasInfantil);
  const fund = toNumber(input.matriculasFundamental);
  const med = toNumber(input.matriculasMedio);
  const segment = normalizeSegment(input.schoolSegment);
  const likelyInepFlag = isLikelyInepFlagInput(input);

  if (!input.isPrivate) return 0;

  if (likelyInepFlag) {
    if (fund > 0 && med > 0) return 20;
    if (med > 0) return 12;
    if (fund > 0) return 10;
    if (inf > 0) return 8;
  }

  if (fund > 0 && med > 0 && total >= 201 && total <= 500) return 25;
  if (segment.includes("idioma") || segment.includes("bilingue")) return 23;
  if (segment.includes("tecnico")) return 20;
  if (fund > 0 && med > 0 && total >= 501 && total <= 1000) return 20;
  if (inf > 0 && fund > 0 && total >= 60) return 15;
  if (segment.includes("fundamental") && total >= 50) return 10;
  if (inf > 0 && fund <= 0 && med <= 0) return 5;
  return total >= 50 ? 10 : 0;
}

function getRevenueScore(revenue: number): number {
  if (revenue >= 250_000) return 30;
  if (revenue >= 100_000) return 25;
  if (revenue >= 50_000) return 15;
  if (revenue >= 30_000) return 8;
  return 0;
}

function getConversionDependencyScore(input: IcpFitInput): number {
  const inf = toNumber(input.matriculasInfantil);
  const fund = toNumber(input.matriculasFundamental);
  const med = toNumber(input.matriculasMedio);
  const segment = normalizeSegment(input.schoolSegment);

  if (fund > 0 && med > 0) return 20;
  if (fund > 0 || segment.includes("tecnico") || segment.includes("idioma")) return 12;
  if (inf > 0) return 5;
  return 5;
}

function getEtapasScore(input: IcpFitInput): number {
  const inf = toNumber(input.matriculasInfantil);
  const fund = toNumber(input.matriculasFundamental);
  const med = toNumber(input.matriculasMedio);

  if (fund > 0 && med > 0) return 15;
  if (med > 0) return 12;
  if (fund > 0) return 10;
  if (inf > 0 && fund > 0) return 8;
  if (inf > 0) return 3;
  return 6;
}

function scoreToIcp(score: number): ICPMatch {
  if (score >= 65) return "alto";
  if (score >= 45) return "medio";
  return "baixo";
}

function scoreToPriority(score: number): Prioridade {
  if (score >= 65) return "imediata";
  if (score >= 45) return "normal";
  return "baixa";
}

function buildApproach(score: number): string {
  if (score >= 85) return "Lead quente. Entrar em contato hoje e agendar diagnostico comercial imediato.";
  if (score >= 65) return "Lead qualificado. Agendar diagnostico nesta semana com foco em captacao.";
  if (score >= 45) return "Validar dados operacionais e contato antes da abordagem comercial completa.";
  if (score >= 25) return "Nutrir lead e revisar janela comercial no proximo ciclo.";
  return "Fora do ICP prioritario no momento. Nao alocar esforco comercial agora.";
}

function buildPainPoints(input: IcpFitInput, revenue: number): string[] {
  const points: string[] = [];
  if (!input.hasPhone) points.push("Sem telefone direto para resposta rapida.");
  if (revenue < 100_000) points.push("Faturamento estimado abaixo do ideal para escala comercial.");
  if (toNumber(input.matriculasMedio) <= 0) points.push("Oferta com menor dependencia de conversao de medio.");
  if (!input.hasAddressOrWebsite) points.push("Dados institucionais incompletos para qualificacao.");
  return points.slice(0, 3);
}

export function computeIcpFitScore(input: IcpFitInput): IcpFitResult {
  const revenue = getEstimatedRevenue(input);

  // Regras de override do ICP.
  if (!input.isPrivate) {
    return {
      score: 0,
      icpMatch: "baixo",
      prioridade: "baixa",
      justificativa: "Escola nao privada: fora do ICP comercial da Wayzen.",
      abordagem: buildApproach(0),
      painPoints: ["Dependencia administrativa fora do ICP alvo (privada)."],
      estimatedRevenue: revenue,
      dimensions: {
        d1Segmento: 0,
        d2Faturamento: 0,
        d3DependenciaConversao: 0,
        d4Contato: 0,
        d5Etapas: 0,
      },
    };
  }

  if (revenue > 0 && revenue < 30_000) {
    return {
      score: 0,
      icpMatch: "baixo",
      prioridade: "baixa",
      justificativa: "Faturamento estimado abaixo de R$30 mil/mês: fora do ICP.",
      abordagem: buildApproach(0),
      painPoints: ["Faturamento estimado abaixo do minimo do ICP."],
      estimatedRevenue: revenue,
      dimensions: {
        d1Segmento: 0,
        d2Faturamento: 0,
        d3DependenciaConversao: 0,
        d4Contato: 0,
        d5Etapas: 0,
      },
    };
  }

  const d1Segmento = getSegmentScore(input);
  const d2Faturamento = getRevenueScore(revenue);
  const d3DependenciaConversao = getConversionDependencyScore(input);
  const d4Contato = input.hasPhone ? 10 : input.hasAddressOrWebsite ? 5 : 0;
  const d5Etapas = getEtapasScore(input);

  const score = Math.max(0, Math.min(100, d1Segmento + d2Faturamento + d3DependenciaConversao + d4Contato + d5Etapas));
  const icpMatch = scoreToIcp(score);
  const prioridade = scoreToPriority(score);

  return {
    score,
    icpMatch,
    prioridade,
    justificativa: `ICP ${score}/100 (Segmento ${d1Segmento}, Faturamento ${d2Faturamento}, Conversao ${d3DependenciaConversao}, Contato ${d4Contato}, Etapas ${d5Etapas}).`,
    abordagem: buildApproach(score),
    painPoints: buildPainPoints(input, revenue),
    estimatedRevenue: revenue,
    dimensions: {
      d1Segmento,
      d2Faturamento,
      d3DependenciaConversao,
      d4Contato,
      d5Etapas,
    },
  };
}
