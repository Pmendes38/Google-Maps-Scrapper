import { NextResponse } from "next/server";

type UfOption = {
  sigla: string;
  nome: string;
};

const UF_FALLBACK: UfOption[] = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

export async function GET() {
  try {
    const resp = await fetch("https://brasilapi.com.br/api/ibge/uf/v1", { cache: "no-store" });
    if (!resp.ok) {
      return NextResponse.json(UF_FALLBACK);
    }
    const payload = (await resp.json()) as UfOption[];
    if (!Array.isArray(payload) || payload.length === 0) {
      return NextResponse.json(UF_FALLBACK);
    }

    const sorted = [...payload].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return NextResponse.json(sorted);
  } catch {
    return NextResponse.json(UF_FALLBACK);
  }
}
