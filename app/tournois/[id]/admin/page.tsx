import { notFound, redirect } from "next/navigation";
import { getTournament, getPendingValidations, isTournamentAdmin, getRounds } from "@/lib/queries";
import AdminClient from "./AdminClient";

export default async function AdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) notFound();
  const isAdmin = await isTournamentAdmin(id);
  if (!isAdmin) redirect(`/tournois/${id}`);

  const [pending, rounds] = await Promise.all([getPendingValidations(id), getRounds(id)]);
  const pendingRounds = rounds.filter((r) => r.status === "pending");

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">Administration</h1>
      <p className="text-sm text-ink-600">{tournament.name}</p>

      <AdminClient
        tournamentId={id}
        tournamentFormat={tournament.format}
        tournamentStatus={tournament.status}
        pending={pending as any}
        pendingRounds={pendingRounds}
      />
    </div>
  );
}