import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getMyTournaments, getUpcomingMatches } from "@/lib/queries";
import { formatLabel, matchStatusLabel, matchStatusTone } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

export default async function HomePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const [tournaments, upcoming] = await Promise.all([getMyTournaments(), getUpcomingMatches()]);

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">
        Salut {me.profile?.display_name?.split(" ")[0] ?? "Joueur"} 👋
      </h1>

      <section className="mt-6">
        <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
          Prochains matchs
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Aucun match à venir" hint="Rejoins ou lance un tournoi pour voir tes matchs ici." />
        ) : (
          <div className="space-y-2">
            {upcoming.slice(0, 5).map((m) => (
              <Link key={m.match_id} href={`/matchs/${m.match_id}`}>
                <Card className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {m.is_home ? "vs" : "@"} {m.opponent_name}
                    </p>
                    <p className="text-xs text-ink-600">{m.tournament_name} · {m.round_name}</p>
                  </div>
                  <Badge tone={matchStatusTone[m.match_status]}>{matchStatusLabel[m.match_status]}</Badge>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 pb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-medium uppercase tracking-wide text-ink-600">
            Mes tournois
          </h2>
          <Link href="/tournois/nouveau" className="text-sm font-medium text-pitch-700">+ Créer</Link>
        </div>
        {tournaments.length === 0 ? (
          <EmptyState title="Aucun tournoi pour l'instant" hint="Crée-en un ou demande un lien d'invitation." />
        ) : (
          <div className="space-y-2">
            {tournaments.map((t) => (
              <Link key={t.id} href={`/tournois/${t.id}`}>
                <Card>
                  <p className="font-display font-medium text-ink-900">{t.name}</p>
                  <p className="text-xs text-ink-600">
                    {formatLabel(t.format)} · {t.status === "draft" ? "Pas encore lancé" : t.status}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}