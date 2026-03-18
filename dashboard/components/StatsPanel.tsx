export function StatsPanel({
  total,
  highICP,
  whatsapp,
  newLeads,
}: {
  total: number;
  highICP: number;
  whatsapp: number;
  newLeads: number;
}) {
  const items = [
    { label: "Total leads", value: total },
    { label: "ICP Alto", value: highICP },
    { label: "WhatsApp-ready", value: whatsapp },
    { label: "Sem contato", value: newLeads },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.42)] p-4">
          <p className="text-sm text-white/60">{item.label}</p>
          <p className="mt-1 font-[var(--font-outfit)] text-2xl font-semibold text-white">
            {item.value.toLocaleString("pt-BR")}
          </p>
        </div>
      ))}
    </div>
  );
}
