"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { claimByToken } from "@/lib/actions";
import Card from "@/components/ui/Card";

type Result =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; name: string; tournamentId: string };

export default function ClaimClient({ token }: { token: string }) {
  const [result, setResult] = useState<Result>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Étape cruciale : la connexion anonyme doit se faire ICI, depuis le
      // navigateur. Le client Supabase du navigateur pose alors lui-même le
      // cookie de session — un Server Component ne peut pas le faire (Next.js
      // l'interdit en dehors d'une Server Action ou d'un Route Handler), ce
      // qui faisait perdre la session tout de suite après "Bienvenue".
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          if (!cancelled) setResult({ status: "error", message: error.message });
          return;
        }
      }

      // À cet instant le cookie est posé : on peut appeler l'action serveur
      // en toute sécurité, elle verra la bonne session.
      const res = await claimByToken(token);
      if (cancelled) return;
      if (res.error) setResult({ status: "error", message: res.error });
      else setResult({ status: "ok", name: res.participant!.display_name, tournamentId: res.participant!.tournament_id });
    }

    run();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">MatchFlow</h1>
      <Card className="mt-6">
        {result.status === "loading" && (
          <p className="text-sm text-ink-600">Connexion en cours...</p>
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
