import { scoreLine } from "@/lib/format";

export default function ScoreBadge({
  home, away, size = "md",
}: { home: number | null; away: number | null; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "text-3xl" : "text-lg";
  return <span className={`tabular-score font-semibold ${cls}`}>{scoreLine(home, away)}</span>;
}