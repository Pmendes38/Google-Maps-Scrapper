interface ScoreBadgeProps {
  score: number | null;
  icp?: string | null;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, icp, size = "md" }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-white/55">sem score</span>;
  }

  const tone =
    score >= 70
      ? "border-[#BF00FF] bg-[rgba(191,0,255,0.2)] text-[#BF00FF]"
      : score >= 40
        ? "border-[#FF8C00] bg-[rgba(255,140,0,0.15)] text-[#FFA500]"
        : "border-[#FF0080] bg-[rgba(255,0,128,0.15)] text-[#FF0080]";

  const dims = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${tone} ${dims}`}>
      {score}
      {icp && <span className="text-xs opacity-70">· {icp}</span>}
    </span>
  );
}

