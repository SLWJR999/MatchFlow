import { notFound, redirect } from "next/navigation";
import { getTournament, getParticipants, isTournamentAdmin } from "@/lib/queries";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ParticipantsClient from "./ParticipantsClient";

export default async function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) notFound();
  const isAdmin = await isTournamentAdmin(id);
  if (!isAdmin) redirect(`/tournois/${id}`);

  const participants = await getParticipants(id);

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">Participants</h1>
      <p className="text-sm text-ink-600">
        {participants.length} / {tournament.max_participants} joueurs
      </p>

      <ParticipantsClient
        tournamentId={id}
        tournamentStatus={tournament.status}
        initialParticipants={participants}
      />
    </div>
  );
}