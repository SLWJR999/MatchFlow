import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getMyTournaments } from "@/lib/queries";
import { formatLabel } from "@/lib/format";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";

export default async function TournoisPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const tournaments = await getMyTournaments();

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-pitch-900">Tournois</h1>
        <Link
          href="/tournois/nouveau"
          className="rounded-lg bg-pitch-700 px-3 py-2 text-sm font-medium text-white"
        >
          + Créer
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <EmptyState title="Aucun tournoi" hint="Crée ton premier tournoi ou utilise un lien d'invitation." />
      ) : (
        <div className="space-y-2">
          {tournaments.map((t) => (
            <Link key={t.id} href={`/tournois/${t.id}`}>
              <Card>
                <p className="font-display font-medium text-ink-900">{t.name}</p>
                <p className="text-xs text-ink-600">
                  {formatLabel(t.format)} · {t.max_participants} places max ·{" "}
                  {t.status === "draft" ? "Pas encore lancé" : t.status}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}