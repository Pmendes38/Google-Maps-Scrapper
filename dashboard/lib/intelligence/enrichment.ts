import { INTELLIGENCE_SOURCES } from "./sources";

type AnyObject = Record<string, unknown>;

export type EnrichmentRequest = {
  cnpj?: string;
  inepCode?: string;
  city?: string;
  state?: string;
};

export type SourceMeta = {
  endpoint: string;
  provider: string;
};

export type SourceResult = {
  sourceId: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  fieldsFilled: string[];
  confidence: number;
  sourceMeta: SourceMeta;
  payload?: unknown;
  error?: string;
};

export type EnrichmentResponse = {
  requestedAt: string;
  input: EnrichmentRequest;
  consolidated: {
    cnpj?: string | null;
    razaoSocial?: string | null;
    situacaoCadastral?: string | null;
    capitalSocial?: number | null;
    porte?: string | null;
    dataAbertura?: string | null;
    endereco?: string | null;
    bairro?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    ideb?: AnyObject | null;
    inep?: AnyObject | null;
  };
  sources: SourceResult[];
};

type ConnectorFetchResult = {
  ok: boolean;
  status?: number;
  payload?: unknown;
  error?: string;
  latencyMs: number;
};

type ConnectorNormalized = {
  fieldsFilled: string[];
  consolidated: Partial<EnrichmentResponse["consolidated"]>;
  sourceMeta: SourceMeta;
};

type EnrichmentConnector = {
  id: string;
  shouldRun: (input: Required<EnrichmentRequest>) => boolean;
  fetch: (input: Required<EnrichmentRequest>) => Promise<ConnectorFetchResult>;
  normalize: (payload: unknown, input: Required<EnrichmentRequest>) => ConnectorNormalized;
  confidence: (normalized: ConnectorNormalized) => number;
};

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function timedJsonFetch(url: string): Promise<ConnectorFetchResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { cache: "no-store" });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        latencyMs,
      };
    }

    const payload = (await response.json()) as unknown;
    return { ok: true, status: response.status, payload, latencyMs };
  } catch (error) {
    return {
      ok: false,
      error: String(error),
      latencyMs: Date.now() - startedAt,
    };
  }
}

function normalizeString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function mergeConsolidated(
  target: EnrichmentResponse["consolidated"],
  patch: Partial<EnrichmentResponse["consolidated"]>,
) {
  for (const [key, value] of Object.entries(patch)) {
    const typedKey = key as keyof EnrichmentResponse["consolidated"];
    if (target[typedKey] === undefined || target[typedKey] === null || target[typedKey] === "") {
      target[typedKey] = value as never;
    }
  }
}

const brasilApiConnector: EnrichmentConnector = {
  id: "brasilapi_cnpj_cep",
  shouldRun: (input) => input.cnpj.length === 14,
  fetch: async (input) => timedJsonFetch(`https://brasilapi.com.br/api/cnpj/v1/${input.cnpj}`),
  normalize: (payload, input) => {
    const data = (payload ?? {}) as AnyObject;
    const consolidated: Partial<EnrichmentResponse["consolidated"]> = {
      cnpj: input.cnpj || null,
      razaoSocial: normalizeString(data.razao_social),
      situacaoCadastral: normalizeString(data.descricao_situacao_cadastral ?? data.situacao_cadastral),
      capitalSocial: toNumber(data.capital_social),
      porte: normalizeString(data.porte ?? data.descricao_porte),
      dataAbertura: normalizeString(data.data_inicio_atividade),
      endereco: normalizeString(data.logradouro),
      bairro: normalizeString(data.bairro),
      city: normalizeString(data.municipio ?? input.city),
      state: normalizeString(data.uf ?? input.state),
      cep: normalizeDigits(data.cep) || null,
    };

    const fieldsFilled = Object.entries(consolidated)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key]) => key);

    return {
      consolidated,
      fieldsFilled,
      sourceMeta: {
        endpoint: `https://brasilapi.com.br/api/cnpj/v1/${input.cnpj}`,
        provider: "BrasilAPI",
      },
    };
  },
  confidence: (normalized) => Math.min(100, 30 + normalized.fieldsFilled.length * 8),
};

const minhaReceitaConnector: EnrichmentConnector = {
  id: "minha_receita_api",
  shouldRun: (input) => input.cnpj.length === 14,
  fetch: async (input) => timedJsonFetch(`https://minhareceita.org/${input.cnpj}`),
  normalize: (payload, input) => {
    const data = (payload ?? {}) as AnyObject;
    const consolidated: Partial<EnrichmentResponse["consolidated"]> = {
      cnpj: input.cnpj || null,
      razaoSocial: normalizeString(data.razao_social),
      situacaoCadastral: normalizeString(data.descricao_situacao_cadastral ?? data.situacao_cadastral),
      capitalSocial: toNumber(data.capital_social),
      porte: normalizeString(data.porte),
      dataAbertura: normalizeString(data.data_inicio_atividade ?? data.abertura),
      endereco: normalizeString(data.logradouro),
      bairro: normalizeString(data.bairro),
      city: normalizeString(data.municipio ?? input.city),
      state: normalizeString(data.uf ?? input.state),
      cep: normalizeDigits(data.cep) || null,
    };

    const fieldsFilled = Object.entries(consolidated)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key]) => key);

    return {
      consolidated,
      fieldsFilled,
      sourceMeta: {
        endpoint: `https://minhareceita.org/${input.cnpj}`,
        provider: "Minha Receita",
      },
    };
  },
  confidence: (normalized) => Math.min(100, 25 + normalized.fieldsFilled.length * 7),
};

const inepIndicatorConnector: EnrichmentConnector = {
  id: "api_dados_abertos_inep",
  shouldRun: (input) => Boolean(input.inepCode) || Boolean(input.city && input.state),
  fetch: async (input) => {
    if (input.inepCode) {
      return timedJsonFetch(`http://api.dadosabertosinep.org/v1/ideb/escola/${input.inepCode}.json`);
    }
    return timedJsonFetch(`http://api.dadosabertosinep.org/v1/ideb/uf/${encodeURIComponent(input.state)}.json`);
  },
  normalize: (payload, input) => {
    const data = (payload ?? {}) as AnyObject;
    const ideb = data as AnyObject;
    const fieldsFilled = Object.keys(ideb).length > 0 ? ["ideb"] : [];
    return {
      consolidated: {
        ideb: Object.keys(ideb).length > 0 ? ideb : null,
        inep: input.inepCode ? { inepCode: input.inepCode } : null,
      },
      fieldsFilled,
      sourceMeta: {
        endpoint: input.inepCode
          ? `http://api.dadosabertosinep.org/v1/ideb/escola/${input.inepCode}.json`
          : `http://api.dadosabertosinep.org/v1/ideb/uf/${encodeURIComponent(input.state)}.json`,
        provider: "dadosabertosinep.org",
      },
    };
  },
  confidence: (normalized) => (normalized.fieldsFilled.length > 0 ? 40 : 5),
};

const CONNECTORS: EnrichmentConnector[] = [
  brasilApiConnector,
  minhaReceitaConnector,
  inepIndicatorConnector,
];

async function runConnector(
  connector: EnrichmentConnector,
  input: Required<EnrichmentRequest>,
): Promise<{ result: SourceResult; normalized?: ConnectorNormalized }> {
  const fetched = await connector.fetch(input);
  if (!fetched.ok || fetched.payload === undefined) {
    return {
      result: {
        sourceId: connector.id,
        ok: false,
        status: fetched.status,
        latencyMs: fetched.latencyMs,
        fieldsFilled: [],
        confidence: 0,
        sourceMeta: {
          endpoint: "n/a",
          provider: connector.id,
        },
        error: fetched.error ?? "unknown_error",
      },
    };
  }

  const normalized = connector.normalize(fetched.payload, input);
  return {
    normalized,
    result: {
      sourceId: connector.id,
      ok: true,
      status: fetched.status,
      latencyMs: fetched.latencyMs,
      payload: fetched.payload,
      fieldsFilled: normalized.fieldsFilled,
      confidence: connector.confidence(normalized),
      sourceMeta: normalized.sourceMeta,
    },
  };
}

export async function enrichSchoolLead(input: EnrichmentRequest): Promise<EnrichmentResponse> {
  const normalizedInput: Required<EnrichmentRequest> = {
    cnpj: normalizeDigits(input.cnpj),
    inepCode: normalizeDigits(input.inepCode),
    city: String(input.city ?? "").trim(),
    state: String(input.state ?? "").trim().toUpperCase(),
  };

  const sources: SourceResult[] = [];
  const consolidated: EnrichmentResponse["consolidated"] = {
    cnpj: normalizedInput.cnpj || null,
    city: normalizedInput.city || null,
    state: normalizedInput.state || null,
    ideb: null,
    inep: null,
  };

  for (const connector of CONNECTORS) {
    if (!connector.shouldRun(normalizedInput)) {
      continue;
    }
    const { result, normalized } = await runConnector(connector, normalizedInput);
    sources.push(result);
    if (normalized) {
      mergeConsolidated(consolidated, normalized.consolidated);
    }
  }

  return {
    requestedAt: new Date().toISOString(),
    input: normalizedInput,
    consolidated,
    sources,
  };
}

export function listIntelligenceSources() {
  return INTELLIGENCE_SOURCES;
}
