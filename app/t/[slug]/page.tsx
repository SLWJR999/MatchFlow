import { notFound } from "next/navigation";
import {
  getTournamentBySlug, getStandings, getMatchesWithNames, getParticipants,
  getTiesWithMatches,
} from "@/lib/queries";
import { formatLabel, matchStatusLabel, matchStatusTone, scoreLine, formatDateShort } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import BracketView from "@/components/BracketView";

export default async function PublicTournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament || !tournament.is_public) notFound();

  const [matches, participants] = await Promise.all([
    getMatchesWithNames(tournament.id),
    getParticipants(tournament.id),
  ]);
  const standings = tournament.format === "league" ? await getStandings(tournament.id) : [];
  const ties = tournament.format === "knockout" ? await getTiesWithMatches(tournament.id) : [];
  const names = Object.fromEntries(participants.map((p) => [p.id, p.display_name]));

  return (
    <div className="mx-auto max-w-md px-4 pt-8 pb-12">
      <p className="text-xs font-medium uppercase tracking-wide text-pitch-700">MatchFlow</p>
      <h1 className="mt-1 font-display text-2xl font-semibold text-pitch-900">{tournament.name}</h1>
      <p className="text-sm text-ink-600">
        {formatLabel(tournament.format)} · {participants.length} joueurs ·{" "}
        {tournament.status === "completed" ? "Terminé" : tournament.status === "draft" ? "Pas encore lancé" : "En cours"}
      </p>

      {tournament.format === "league" && standings.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
            Classement
          </h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-600">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Joueur</th>
                  <th className="px-2 py-2 text-center">J</th>
                  <th className="px-2 py-2 text-center">Diff</th>
                  <th className="px-3 py-2 text-center">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr key={s.participant_id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink-600">{s.position}</td>
                    <td className="px-3 py-2 font-medium text-ink-900">{s.display_name}</td>
                    <td className="px-2 py-2 text-center text-ink-600">{s.played}</td>
                    <td className="px-2 py-2 text-center text-ink-600">{s.goal_diff > 0 ? "+" : ""}{s.goal_diff}</td>
                    <td className="px-3 py-2 text-center font-semibold text-pitch-900">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {tournament.format === "knockout" && ties.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
            Tableau
          </h2>
          <BracketView ties={ties as any} participantNames={names} />
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
          Résultats
        </h2>
        {matches.filter((m) => m.status !== "scheduled").length === 0 ? (
          <EmptyState title="Pas encore de résultat" />
        ) : (
          <div className="space-y-2">
            {matches
              .filter((m) => m.status !== "scheduled")
              .slice(-10)
              .reverse()
              .map((m) => (
                <Card key={m.id} className="flex items-center justify-between">
                  <div className="text-sm">
                    <p className="font-medium text-ink-900">{m.home_name} vs {m.away_name}</p>
                    <p className="text-xs text-ink-600">{m.round_name} · {formatDateShort(m.played_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-score text-sm font-semibold">{scoreLine(m.home_score, m.away_score)}</span>
                    <Badge tone={matchStatusTone[m.status]}>{matchStatusLabel[m.status]}</Badge>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-ink-600">
        Envoyé par MatchFlow — organise ton propre tournoi sur matchflow.app
      </p>
    </div>
  );
}
