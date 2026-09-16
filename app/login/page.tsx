"use client";

import { useState } from "react";
import Link from "next/link";
import { sendMagicLink, signInWithGoogle } from "@/lib/actions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await sendMagicLink(email);
    setLoading(false);
    if (res?.error) setError(res.error);
    else setSent(true);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-3xl font-semibold text-pitch-900">MatchFlow</h1>
      <p className="mt-1 text-ink-600">Organise et joue tes tournois de foot.</p>

      <Card className="mt-8">
        {sent ? (
          <p className="text-sm text-ink-900">
            Lien envoyé à <strong>{email}</strong>. Ouvre-le depuis ce téléphone pour te connecter.
          </p>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-3">
            <label className="block text-sm font-medium text-ink-900">
              Adresse email
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@exemple.com"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-pitch-600"
              />
            </label>
            {error && <p className="text-sm text-brick-600">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Envoi..." : "Recevoir un lien de connexion"}
            </Button>
          </form>
        )}

        <div className="my-4 flex items-center gap-3 text-xs text-ink-600">
          <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
        </div>

        <form action={async () => { await signInWithGoogle(); }}>
          <Button type="submit" variant="secondary" className="w-full">
            Continuer avec Google
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-ink-600">
        Invité·e à un tournoi ? Utilise le lien reçu par WhatsApp — pas besoin de créer de compte.
        {" "}Ou <Link href="/rejoindre" className="underline underline-offset-2">entre un code de tournoi</Link>.
      </p>
    </div>
  );
}