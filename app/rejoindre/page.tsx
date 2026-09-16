"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinByCode, signInAnonymously } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function RejoindreParCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) await signInAnonymously();

    const res = await joinByCode(code.trim());
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    router.push(`/tournois/${res.participant.tournament_id}`);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">Rejoindre un tournoi</h1>
      <p className="mt-1 text-sm text-ink-600">
        Entre le code donné par l&apos;organisateur du tournoi.
      </p>

      <Card className="mt-6">
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ex. FIFA24"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-center text-lg font-medium tracking-widest outline-none focus:border-pitch-600"
          />
          {error && <p className="text-sm text-brick-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "..." : "Rejoindre"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
