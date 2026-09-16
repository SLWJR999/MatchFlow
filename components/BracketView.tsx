import type { Tie } from "@/lib/types/database";
import { scoreLine } from "@/lib/format";
import Badge from "@/components/ui/Badge";

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "F", "3P"];
const STAGE_LABEL: Record<string, string> = {
  R32: "16es", R16: "8es", QF: "Quarts", SF: "Demies", F: "Finale", "3P": "3e place",
};

interface TieWithMatches extends Tie {
  matches: Array<{
    id: string; home_score: number | null; away_score: number | null;
    status: string; leg: number;
  }>;
}

export default function BracketView({
  ties, participantNames,
}: { ties: TieWithMatches[]; participantNames: Record<string, string> }) {
  const stages = STAGE_ORDER.filter((s) => ties.some((t) => t.stage === s));
  const mainStages = stages.filter((s) => s !== "3P");
  const hasThirdPlace = stages.includes("3P");

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-6">
        {mainStages.map((stage) => (
          <div key={stage} className="flex w-44 flex-col justify-around gap-4">
            <p className="text-center text-xs font-medium uppercase tracking-wide text-ink-600">
              {STAGE_LABEL[stage] ?? stage}
            </p>
            {ties
              .filter((t) => t.stage === stage)
              .sort((a, b) => a.position - b.position)
              .map((t) => (
                <TieCard key={t.id} tie={t} names={participantNames} />
              ))}
          </div>
        ))}
      </div>

      {hasThirdPlace && (
        <div className="mt-6 w-44">
          <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-ink-600">
            Match pour la 3e place
          </p>
          {ties.filter((t) => t.stage === "3P").map((t) => (
            <TieCard key={t.id} tie={t} names={participantNames} />
          ))}
        </div>
      )}
    </div>
  );
}

function TieCard({ tie, names }: { tie: TieWithMatches; names: Record<string, string> }) {
  const nameA = tie.participant_a ? names[tie.participant_a] ?? "?" : "À déterminer";
  const nameB = tie.participant_b ? names[tie.participant_b] ?? "?" : "À déterminer";
  const lastMatch = [...tie.matches].sort((a, b) => b.leg - a.leg)[0];

  return (
    <div className="rounded-lg border border-line bg-surface p-2.5 text-sm">
      <Row name={nameA} won={tie.winner_id === tie.participant_a} score={
        tie.matches.length === 1 ? lastMatch?.home_score ?? null : null
      } />
      <div className="my-1 h-px bg-line" />
      <Row name={nameB} won={tie.winner_id === tie.participant_b} score={
        tie.matches.length === 1 ? lastMatch?.away_score ?? null : null
      } />
      {tie.matches.length === 2 && (
        <p className="mt-1.5 text-center text-[11px] text-ink-600">
          Aller {scoreLine(tie.matches[0]?.home_score ?? null, tie.matches[0]?.away_score ?? null)} · Retour{" "}
          {scoreLine(tie.matches[1]?.home_score ?? null, tie.matches[1]?.away_score ?? null)}
        </p>
      )}
      {tie.status === "pending" && (
        <div className="mt-1"><Badge tone="neutral">En attente</Badge></div>
      )}
    </div>
  );
}

function Row({ name, won, score }: { name: string; won: boolean; score: number | null }) {
  return (
    <div className={`flex items-center justify-between ${won ? "font-semibold text-pitch-900" : "text-ink-900"}`}>
      <span className="truncate">{name}</span>
      {score !== null && <span className="tabular-score ml-2">{score}</span>}
    </div>
  );
}
