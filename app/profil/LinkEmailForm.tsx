"use client";

import { useState } from "react";
import { linkEmailToAccount } from "@/lib/actions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function LinkEmailForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await linkEmailToAccount(email);
    setLoading(false);
    if (res?.error) setError(res.error);
    else setSent(true);
  }

  return (
    <Card className="border-gold-500 bg-gold-100/30">
      <p className="text-sm font-medium text-ink-900">Compte invité</p>
      <p className="mt-1 text-xs text-ink-600">
        Ajoute ton email pour retrouver tes tournois même si tu changes de téléphone.
      </p>
      {sent ? (
        <p className="mt-2 text-sm text-pitch-700">
          Clique sur le lien reçu par email pour confirmer.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-pitch-600"
          />
          <Button type="submit" disabled={loading}>{loading ? "..." : "Ajouter"}</Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-brick-600">{error}</p>}
    </Card>
  );
}
