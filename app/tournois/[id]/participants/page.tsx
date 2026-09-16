import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getTournament, getParticipants, isTournamentAdmin } from "@/lib/queries";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ParticipantsClient from "./ParticipantsClient";

export default async function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const tournament = await getTournament(id);
  if (!tournament) notFound();
  const isAdmin = await isTournamentAdmin(id);
  const participants = await getParticipants(id);

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">Participants</h1>
      <p className="text-sm text-ink-600">
        {participants.length} / {tournament.max_participants} joueurs
      </p>

      {isAdmin ? (
        <ParticipantsClient
          tournamentId={id}
          tournamentStatus={tournament.status}
          initialParticipants={participants}
        />
      ) : (
        <div className="mt-4 space-y-2">
          {participants.map((p) => (
            <Card key={p.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink-900">{p.display_name}</p>
                {p.team_name && <p className="text-xs text-ink-600">{p.team_name}</p>}
              </div>
              <Badge tone={p.status === "active" ? "pitch" : p.status === "withdrawn" ? "brick" : "gold"}>
                {p.status === "active" ? "Actif" : p.status === "withdrawn" ? "Retiré" : "En attente"}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}