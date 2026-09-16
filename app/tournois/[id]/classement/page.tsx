import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournament, getStandings, getTiesWithMatches, getParticipants } from "@/lib/queries";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import BracketView from "@/components/BracketView";

export default async function ClassementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) notFound();

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <Link href={`/tournois/${id}`} className="text-sm text-ink-600">← {tournament.name}</Link>
      <h1 className="mt-1 font-display text-2xl font-semibold text-pitch-900">Classement</h1>

      {tournament.format === "league" ? (
        <LeagueStandings tournamentId={id} />
      ) : (
        <KnockoutBracket tournamentId={id} />
      )}
    </div>
  );
}

async function LeagueStandings({ tournamentId }: { tournamentId: string }) {
  const standings = await getStandings(tournamentId);
  if (standings.length === 0) return <EmptyState title="Le calendrier n'est pas encore généré" />;

  return (
    <Card className="mt-4 overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-600">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Joueur</th>
            <th className="px-2 py-2 text-center">J</th>
            <th className="px-2 py-2 text-center">V</th>
            <th className="px-2 py-2 text-center">N</th>
            <th className="px-2 py-2 text-center">D</th>
            <th className="px-2 py-2 text-center">BP</th>
            <th className="px-2 py-2 text-center">BC</th>
            <th className="px-2 py-2 text-center">Diff</th>
            <th className="px-3 py-2 text-center">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.participant_id}
              className={`border-b border-line last:border-0 ${
                s.participant_status === "withdrawn" ? "opacity-50" : ""
              }`}
            >
              <td className="px-3 py-2 text-ink-600">{s.position}</td>
              <td className="px-3 py-2 font-medium text-ink-900">
                {s.display_name}
                {s.participant_status === "withdrawn" && (
                  <span className="ml-1 text-xs text-ink-600">(retiré)</span>
                )}
              </td>
              <td className="px-2 py-2 text-center text-ink-600">{s.played}</td>
              <td className="px-2 py-2 text-center text-ink-600">{s.wins}</td>
              <td className="px-2 py-2 text-center text-ink-600">{s.draws}</td>
              <td className="px-2 py-2 text-center text-ink-600">{s.losses}</td>
              <td className="px-2 py-2 text-center text-ink-600">{s.goals_for}</td>
              <td className="px-2 py-2 text-center text-ink-600">{s.goals_against}</td>
              <td className="px-2 py-2 text-center text-ink-600">
                {s.goal_diff > 0 ? "+" : ""}{s.goal_diff}
              </td>
              <td className="px-3 py-2 text-center font-semibold text-pitch-900">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function KnockoutBracket({ tournamentId }: { tournamentId: string }) {
  const [ties, participants] = await Promise.all([
    getTiesWithMatches(tournamentId),
    getParticipants(tournamentId),
  ]);
  if (ties.length === 0) return <EmptyState title="Le tableau n'est pas encore généré" />;

  const names = Object.fromEntries(participants.map((p) => [p.id, p.display_name]));

  return (
    <div className="mt-4">
      <BracketView ties={ties as any} participantNames={names} />
    </div>
  );
}
