"use client";

import { useRef, useState, type ChangeEvent } from "react";

export function ImportCsvButton() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setToast(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/leads/import", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        inserted?: number;
        updated?: number;
        errors?: string[];
        error?: string;
      };

      if (!response.ok) {
        setToast(payload.error ?? "Falha ao importar CSV");
      } else {
        setToast(`${payload.inserted ?? 0} leads importados com sucesso (${payload.updated ?? 0} atualizados)`);
      }
    } catch (error) {
      setToast(`Erro ao importar CSV: ${String(error)}`);
    } finally {
      setIsLoading(false);
      if (inputRef.current) inputRef.current.value = "";
      setTimeout(() => setToast(null), 5000);
    }
  }

  return (
    <div className="relative">
      <button
        className="rounded-full border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.35)] px-4 py-2 text-sm text-white hover:border-[var(--wayzen-purple)] disabled:opacity-60"
        disabled={isLoading}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {isLoading ? "Importando..." : "Importar CSV"}
      </button>

      <input
        accept=".csv"
        className="hidden"
        onChange={onFileChange}
        ref={inputRef}
        type="file"
      />

      {toast && (
        <div className="absolute right-0 top-12 z-20 w-80 rounded-lg border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.92)] p-3 text-xs text-white/90 shadow-md">
          {toast}
        </div>
      )}
    </div>
  );
}
