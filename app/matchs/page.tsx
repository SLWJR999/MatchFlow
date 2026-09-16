import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getUpcomingMatches } from "@/lib/queries";
import { matchStatusLabel, matchStatusTone, formatDate, waLink, telLink } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

export default async function MatchsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const matches = await getUpcomingMatches();

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">Mes matchs</h1>

      {matches.length === 0 ? (
        <EmptyState title="Aucun match à venir" />
      ) : (
        <div className="mt-4 space-y-2">
          {matches.map((m) => (
            <Card key={m.match_id}>
              <Link href={`/matchs/${m.match_id}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {m.is_home ? "vs" : "@"} {m.opponent_name}
                    </p>
                    <p className="text-xs text-ink-600">{m.tournament_name} · {m.round_name}</p>
                    <p className="text-xs text-ink-600">{formatDate(m.scheduled_at)}</p>
                  </div>
                  <Badge tone={matchStatusTone[m.match_status]}>{matchStatusLabel[m.match_status]}</Badge>
                </div>
              </Link>
              {m.opponent_phone && (
                <div className="mt-2 flex gap-3 text-xs font-medium text-pitch-700">
                  <a href={waLink(m.opponent_phone)!} target="_blank" rel="noreferrer">WhatsApp</a>
                  <a href={telLink(m.opponent_phone)!}>Appeler</a>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}