import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getMatch, getMatchReports, getContact } from "@/lib/queries";
import { matchStatusLabel, matchStatusTone, formatDate, scoreLine, waLink, telLink } from "@/lib/format";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import MatchReportForm from "./MatchReportForm";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const match = await getMatch(id);
  if (!match) notFound();

  const reports = await getMatchReports(id);
  const myParticipantId =
    match.home?.profile_id === me.user.id ? match.home.id :
    match.away?.profile_id === me.user.id ? match.away.id : null;

  const opponent = myParticipantId === match.home?.id ? match.away : match.home;
  const contact = opponent ? await getContact(opponent.id) : null;

  const myReport = reports.find((r) => r.participant_id === myParticipantId);
  const opponentReport = reports.find((r) => r.participant_id === opponent?.id);

  const canReport = myParticipantId && ["scheduled", "reported", "confirmed", "disputed"].includes(match.status);

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <Link href={`/tournois/${match.tournament_id}`} className="text-sm text-ink-600">
        ← {match.tournaments?.name}
      </Link>

      <Card className="mt-3 text-center">
        <p className="text-xs text-ink-600">{match.rounds?.name} · {formatDate(match.scheduled_at)}</p>
        <div className="mt-2 flex items-center justify-center gap-4">
          <p className="font-display text-lg font-medium text-ink-900">{match.home?.display_name ?? "?"}</p>
          <span className="tabular-score text-3xl font-semibold text-pitch-900">
            {scoreLine(match.home_score, match.away_score)}
          </span>
          <p className="font-display text-lg font-medium text-ink-900">{match.away?.display_name ?? "?"}</p>
        </div>
        <div className="mt-3 flex justify-center">
          <Badge tone={matchStatusTone[match.status as keyof typeof matchStatusTone]}>
            {matchStatusLabel[match.status as keyof typeof matchStatusLabel]}
          </Badge>
        </div>
        {match.venue && <p className="mt-2 text-xs text-ink-600">Lieu : {match.venue}</p>}
      </Card>

      {opponent && (contact?.phone || contact?.whatsapp) && (
        <Card className="mt-3 flex items-center justify-between">
          <p className="text-sm text-ink-900">Contacter {opponent.display_name}</p>
          <div className="flex gap-3 text-sm font-medium text-pitch-700">
            {contact.phone && <a href={waLink(contact.phone)!} target="_blank" rel="noreferrer">WhatsApp</a>}
            {contact.phone && <a href={telLink(contact.phone)!}>Appeler</a>}
          </div>
        </Card>
      )}

      {canReport && match.status !== "validated" && (
        <div className="mt-4">
          <MatchReportForm
            matchId={id}
            participantId={myParticipantId!}
            myReport={myReport ?? null}
            opponentReported={Boolean(opponentReport)}
            requireScreenshot={match.tournaments?.require_screenshot ?? true}
          />
        </div>
      )}

      {match.status === "disputed" && (
        <Card className="mt-4 border-brick-600 bg-brick-100/40">
          <p className="text-sm font-medium text-brick-600">Litige</p>
          <p className="text-xs text-ink-600">
            Les scores saisis ne correspondent pas. L'administrateur va trancher.
          </p>
        </Card>
      )}
    </div>
  );
}