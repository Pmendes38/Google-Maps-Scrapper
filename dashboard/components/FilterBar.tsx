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
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.push(`/?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        value={params.get("state") ?? ""}
        onChange={(event) => update("state", event.target.value)}
      >
        <option value="">Todos os estados</option>
        {UF_LIST.map((uf) => (
          <option key={uf} value={uf}>
            {uf}
          </option>
        ))}
      </select>

      <select
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        value={params.get("segment") ?? ""}
        onChange={(event) => update("segment", event.target.value)}
      >
        <option value="">Todos os segmentos</option>
        {SEGMENTS.map((segment) => (
          <option key={segment} value={segment}>
            {segment}
          </option>
        ))}
      </select>

      <select
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        value={params.get("icp") ?? ""}
        onChange={(event) => update("icp", event.target.value)}
      >
        <option value="">ICP (todos)</option>
        {(["alto", "medio", "baixo"] as const).map((icp) => (
          <option key={icp} value={icp}>
            ICP {icp}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          className="w-24"
          defaultValue={params.get("min_score") ?? "0"}
          max="100"
          min="0"
          step="10"
          type="range"
          onChange={(event) => update("min_score", event.target.value !== "0" ? event.target.value : "")}
        />
        Score &gt;= {params.get("min_score") ?? 0}
      </label>
    </div>
  );
}
