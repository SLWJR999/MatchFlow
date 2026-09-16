import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournament, getRounds, getMatchesWithNames } from "@/lib/queries";
import { roundStatusLabel, matchStatusLabel, matchStatusTone, scoreLine, formatDateShort } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

export default async function TournamentMatchsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) notFound();

  const [rounds, matches] = await Promise.all([getRounds(id), getMatchesWithNames(id)]);
  const byRound = new Map<string, typeof matches>();
  for (const m of matches) {
    const list = byRound.get(m.round_id) ?? [];
    list.push(m);
    byRound.set(m.round_id, list);
  }

  const visibleRounds = rounds.filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <Link href={`/tournois/${id}`} className="text-sm text-ink-600">← {tournament.name}</Link>
      <h1 className="mt-1 font-display text-2xl font-semibold text-pitch-900">Matchs</h1>

      {visibleRounds.length === 0 ? (
        <EmptyState title="Aucune journée publiée pour l'instant" />
      ) : (
        <div className="mt-4 space-y-6">
          {visibleRounds.map((r) => (
            <section key={r.id}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-sm font-medium text-ink-900">{r.name}</h2>
                <Badge tone={r.status === "validated" ? "pitch" : "gold"}>{roundStatusLabel[r.status]}</Badge>
              </div>
              <div className="space-y-2">
                {(byRound.get(r.id) ?? []).map((m) => (
                  <Link key={m.id} href={`/matchs/${m.id}`}>
                    <Card className="flex items-center justify-between">
                      <div className="text-sm">
                        <p className="font-medium text-ink-900">{m.home_name ?? "?"} vs {m.away_name ?? "?"}</p>
                        <p className="text-xs text-ink-600">{formatDateShort(m.scheduled_at ?? m.played_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-score text-sm font-semibold">{scoreLine(m.home_score, m.away_score)}</span>
                        <Badge tone={matchStatusTone[m.status]}>{matchStatusLabel[m.status]}</Badge>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}