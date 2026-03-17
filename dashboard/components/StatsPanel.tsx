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
        <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold">{item.value.toLocaleString("pt-BR")}</p>
        </div>
      ))}
    </div>
  );
}
