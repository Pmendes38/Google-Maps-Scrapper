interface ScoreBadgeProps {
  score: number | null;
  icp?: string | null;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, icp, size = "md" }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-gray-400">sem score</span>;
  }

  const color =
    score >= 70
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 40
        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
        : "bg-red-100 text-red-800 border-red-200";
  const dims = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${color} ${dims}`}>
      {score}
      {icp && <span className="text-xs opacity-60">· {icp}</span>}
    </span>
  );
}
