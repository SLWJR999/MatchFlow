"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveDispute } from "@/lib/actions";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function AdminScoreForm({
  matchId, tournamentId, currentHome, currentAway, alreadyValidated = false,
}: {
  matchId: string; tournamentId: string;
  currentHome: number | null; currentAway: number | null;
  alreadyValidated?: boolean;
}) {
  const router = useRouter();
  const [home, setHome] = useState(currentHome?.toString() ?? "");
  const [away, setAway] = useState(currentAway?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function doSubmit() {
    setLoading(true);
    setError(null);
    const res = await resolveDispute({
      matchId, tournamentId, homeScore: Number(home), awayScore: Number(away),
    });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setConfirming(false);
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (alreadyValidated && !confirming) { setConfirming(true); return; }
    doSubmit();
  }

  return (
    <Card className="border-pitch-700/30 bg-pitch-100/30">
      <p className="text-sm font-medium text-pitch-900">
        {alreadyValidated ? "Corriger le score officiel" : "Score officiel (admin)"}
      </p>
      <p className="mt-1 text-xs text-ink-600">
        {alreadyValidated
          ? "En coupe, une correction qui change le vainqueur peut être refusée si le tour suivant a déjà commencé."
          : "S\u2019affiche immédiatement, sans attendre les joueurs."}
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div className="flex items-center justify-center gap-3">
          <input
            type="number" min={0} required value={home}
            onChange={(e) => { setHome(e.target.value); setConfirming(false); }}
            className="w-16 rounded-lg border border-line px-2 py-2 text-center text-lg font-semibold tabular-score"
          />
          <span className="text-ink-600">—</span>
          <input
            type="number" min={0} required value={away}
            onChange={(e) => { setAway(e.target.value); setConfirming(false); }}
            className="w-16 rounded-lg border border-line px-2 py-2 text-center text-lg font-semibold tabular-score"
          />
        </div>
        {error && <p className="text-sm text-brick-600">{error}</p>}
        {confirming && !error && (
          <p className="text-sm text-gold-500">
            Ce match est déjà validé. Confirme pour écraser le score officiel.
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Enregistrement..." : confirming ? "Confirmer la correction" : alreadyValidated ? "Corriger" : "Valider ce score"}
        </Button>
      </form>
    </Card>
  );
}
