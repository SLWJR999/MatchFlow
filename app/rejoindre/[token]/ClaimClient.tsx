"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { claimByToken } from "@/lib/actions";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

type Result =
  | { status: "loading" }
  | { status: "confirm"; name: string }
  | { status: "error"; message: string }
  | { status: "ok"; name: string; tournamentId: string };

export default function ClaimClient({ token }: { token: string }) {
  const [result, setResult] = useState<Result>({ status: "loading" });

  async function doClaim() {
    const res = await claimByToken(token);
    if (res.error) setResult({ status: "error", message: res.error });
    else setResult({ status: "ok", name: res.participant!.display_name, tournamentId: res.participant!.tournament_id });
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user && !user.is_anonymous) {
        // Quelqu'un est déjà connecté avec un vrai compte sur cet appareil
        // (souvent : la personne qui a créé le lien vient de tester le lien
        // elle-même dans le même navigateur, ou un appareil partagé). On ne
        // rattache pas silencieusement ce lien à ce compte : on demande.
        const { data: profile } = await supabase
          .from("profiles").select("display_name").eq("id", user.id).maybeSingle();
        if (!cancelled) {
          setResult({ status: "confirm", name: profile?.display_name ?? user.email ?? "ce compte" });
        }
        return;
      }

      // Étape cruciale : la connexion anonyme doit se faire ICI, depuis le
      // navigateur. Le client Supabase du navigateur pose alors lui-même le
      // cookie de session — un Server Component ne peut pas le faire (Next.js
      // l'interdit en dehors d'une Server Action ou d'un Route Handler), ce
      // qui faisait perdre la session tout de suite après "Bienvenue".
      if (!user) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          if (!cancelled) setResult({ status: "error", message: error.message });
          return;
        }
      }

      if (!cancelled) await doClaim();
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function continueAsCurrentAccount() {
    setResult({ status: "loading" });
    await doClaim();
  }

  async function useAnotherAccount() {
    setResult({ status: "loading" });
    const supabase = createClient();
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) { setResult({ status: "error", message: error.message }); return; }
    await doClaim();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">MatchFlow</h1>
      <Card className="mt-6">
        {result.status === "loading" && (
          <p className="text-sm text-ink-600">Connexion en cours...</p>
        )}

        {result.status === "confirm" && (
          <>
            <p className="text-sm font-medium text-ink-900">
              Tu es connecté·e en tant que <span className="text-pitch-700">{result.name}</span>.
            </p>
            <p className="mt-1 text-sm text-ink-600">
              Rejoindre ce tournoi avec ce compte ?
            </p>
            <div className="mt-4 space-y-2">
              <Button className="w-full" onClick={continueAsCurrentAccount}>
                Oui, c&apos;est moi
              </Button>
              <Button variant="secondary" className="w-full" onClick={useAnotherAccount}>
                Non, ce n&apos;est pas moi
              </Button>
            </div>
          </>
        )}

        {result.status === "error" && (
          <>
            <p className="font-medium text-brick-600">Lien invalide</p>
            <p className="mt-1 text-sm text-ink-600">{result.message}</p>
          </>
        )}
        {result.status === "ok" && (
          <>
            <p className="font-display text-lg font-medium text-pitch-900">
              Bienvenue, {result.name} !
            </p>
            <p className="mt-1 text-sm text-ink-600">
              Tu es inscrit·e au tournoi. Retrouve tes matchs et le classement ci-dessous.
            </p>
            <Link
              href={`/tournois/${result.tournamentId}`}
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
