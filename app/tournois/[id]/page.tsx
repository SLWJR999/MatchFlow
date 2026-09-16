import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTournament, getStandings, getMatchesWithNames, isTournamentAdmin, getFinalPhase,
} from "@/lib/queries";
import { formatLabel, formatDateShort, matchStatusLabel, matchStatusTone, scoreLine } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import GenerateScheduleButton from "./GenerateScheduleButton";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) notFound();

  const [isAdmin, matches] = await Promise.all([
    isTournamentAdmin(id),
    getMatchesWithNames(id),
  ]);
  const standings = tournament.format === "league" ? await getStandings(id) : [];
  const finalPhase = tournament.format === "league" ? await getFinalPhase(id) : null;

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-pitch-900">{tournament.name}</h1>
          <p className="text-sm text-ink-600">{formatLabel(tournament.format)}</p>
        </div>
        {isAdmin && (
          <Link href={`/tournois/${id}/admin`} className="text-sm font-medium text-pitch-700">
            Admin
          </Link>
        )}
      </div>

      {tournament.is_public && (
        <Link
          href={`/t/${tournament.slug}`} target="_blank"
          className="mt-2 inline-block text-xs text-ink-600 underline underline-offset-2"
        >
          Voir la page publique (à partager)
        </Link>
      )}

      {tournament.status === "draft" && isAdmin && (
        <Card className="mt-4">
          <p className="text-sm text-ink-900">
            Le calendrier n&apos;a pas encore été généré.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href={`/tournois/${id}/participants`} className="flex-1">
              <Button variant="secondary" className="w-full">Gérer les joueurs</Button>
            </Link>
            <GenerateScheduleButton tournamentId={id} />
          </div>
        </Card>
      )}

      <div className="mt-5 flex gap-2 text-sm">
        <Link href={`/tournois/${id}/matchs`} className="rounded-full bg-pitch-100 px-3 py-1.5 font-medium text-pitch-900">
          Matchs
        </Link>
        <Link href={`/tournois/${id}/classement`} className="rounded-full px-3 py-1.5 text-ink-600">
          Classement
        </Link>
        <Link href={`/tournois/${id}/participants`} className="rounded-full px-3 py-1.5 text-ink-600">
          Participants
        </Link>
      </div>

      {finalPhase && (
        <Link href={`/tournois/${finalPhase.id}`}>
          <Card className="mt-4 border-gold-500 bg-gold-100/40">
            <p className="text-sm font-medium text-ink-900">Phase finale générée →</p>
            <p className="text-xs text-ink-600">{finalPhase.name}</p>
          </Card>
        </Link>
      )}

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
          {tournament.status === "completed" && isAdmin && !finalPhase && (
            <Link href={`/tournois/${id}/admin`} className="mt-2 block text-sm font-medium text-pitch-700">
              Générer la phase finale →
            </Link>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
          Résultats récents
        </h2>
        {matches.filter((m) => m.status !== "scheduled").length === 0 ? (
          <EmptyState title="Pas encore de résultat" />
        ) : (
          <div className="space-y-2">
            {matches
              .filter((m) => m.status !== "scheduled")
              .slice(-8)
              .reverse()
              .map((m) => (
                <Link key={m.id} href={`/matchs/${m.id}`}>
                  <Card className="flex items-center justify-between">
                    <div className="text-sm">
                      <p className="font-medium text-ink-900">{m.home_name} vs {m.away_name}</p>
                      <p className="text-xs text-ink-600">{m.round_name} · {formatDateShort(m.played_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular-score text-sm font-semibold">{scoreLine(m.home_score, m.away_score)}</span>
                      <Badge tone={matchStatusTone[m.status]}>{matchStatusLabel[m.status]}</Badge>
                    </div>
                  </Card>
                </Link>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}