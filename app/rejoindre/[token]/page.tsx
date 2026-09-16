import { claimByToken } from "@/lib/actions";
import Card from "@/components/ui/Card";
import Link from "next/link";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await claimByToken(token);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">MatchFlow</h1>
      <Card className="mt-6">
        {res.error ? (
          <>
            <p className="font-medium text-brick-600">Lien invalide</p>
            <p className="mt-1 text-sm text-ink-600">{res.error}</p>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-medium text-pitch-900">
              Bienvenue, {res.participant?.display_name} !
            </p>
            <p className="mt-1 text-sm text-ink-600">
              Tu es inscrit·e au tournoi. Retrouve tes matchs et le classement ci-dessous.
            </p>
            <Link
              href={`/tournois/${res.participant?.tournament_id}`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-pitch-700 px-4 py-2.5 text-sm font-medium text-white"
            >
              Voir le tournoi
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}