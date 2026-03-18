"use client";

import { useRouter, useSearchParams } from "next/navigation";

const UF_LIST = ["DF", "GO", "SP", "RJ", "MG", "RS", "PR", "BA", "CE", "PE", "SC", "AM"];
const SEGMENTS = [
  "ensino fundamental",
  "ensino medio",
  "educacao infantil",
  "creche/bercario",
  "idiomas/bilingue",
  "ensino tecnico",
];

export function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="wayzen-input px-3 py-2 text-sm"
        onChange={(event) => update("state", event.target.value)}
        value={params.get("state") ?? ""}
      >
        <option value="">Todos os estados</option>
        {UF_LIST.map((uf) => (
          <option className="bg-[#14071f]" key={uf} value={uf}>
            {uf}
          </option>
        ))}
      </select>

      <select
        className="wayzen-input px-3 py-2 text-sm"
        onChange={(event) => update("segment", event.target.value)}
        value={params.get("segment") ?? ""}
      >
        <option value="">Todos os segmentos</option>
        {SEGMENTS.map((segment) => (
          <option className="bg-[#14071f]" key={segment} value={segment}>
            {segment}
          </option>
        ))}
      </select>

      <select
        className="wayzen-input px-3 py-2 text-sm"
        onChange={(event) => update("icp", event.target.value)}
        value={params.get("icp") ?? ""}
      >
        <option value="">ICP (todos)</option>
        {(["alto", "medio", "baixo"] as const).map((icp) => (
          <option className="bg-[#14071f]" key={icp} value={icp}>
            ICP {icp}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 rounded-lg border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.25)] px-3 py-2 text-sm text-white/80">
        <input
          className="accent-[#BF00FF]"
          defaultValue={params.get("min_score") ?? "0"}
          max="100"
          min="0"
          onChange={(event) => update("min_score", event.target.value !== "0" ? event.target.value : "")}
          step="10"
          type="range"
        />
        Score {"\u003e="} {params.get("min_score") ?? 0}
      </label>
    </div>
  );
}
