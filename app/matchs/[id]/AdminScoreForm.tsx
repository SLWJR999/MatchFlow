"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveDispute } from "@/lib/actions";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function AdminScoreForm({
  matchId, tournamentId, currentHome, currentAway,
}: {
  matchId: string; tournamentId: string;
  currentHome: number | null; currentAway: number | null;
}) {
  const router = useRouter();
  const [home, setHome] = useState(currentHome?.toString() ?? "");
  const [away, setAway] = useState(currentAway?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await resolveDispute({
      matchId, tournamentId, homeScore: Number(home), awayScore: Number(away),
    });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    router.refresh();
  }

  return (
    <Card className="border-pitch-700/30 bg-pitch-100/30">
      <p className="text-sm font-medium text-pitch-900">Score officiel (admin)</p>
      <p className="mt-1 text-xs text-ink-600">
        S&apos;affiche immédiatement, sans attendre les joueurs.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div className="flex items-center justify-center gap-3">
          <input
            type="number" min={0} required value={home}
            onChange={(e) => setHome(e.target.value)}
            className="w-16 rounded-lg border border-line px-2 py-2 text-center text-lg font-semibold tabular-score"
          />
          <span className="text-ink-600">—</span>
          <input
            type="number" min={0} required value={away}
            onChange={(e) => setAway(e.target.value)}
            className="w-16 rounded-lg border border-line px-2 py-2 text-center text-lg font-semibold tabular-score"
          />
        </div>
        {error && <p className="text-sm text-brick-600">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Enregistrement..." : "Valider ce score"}
        </Button>
      </form>
    </Card>
  );
}
