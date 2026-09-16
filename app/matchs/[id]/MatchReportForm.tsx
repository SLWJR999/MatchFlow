"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitReport, uploadScreenshot } from "@/lib/actions";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function MatchReportForm({
  matchId, participantId, myReport, opponentReported, requireScreenshot,
}: {
  matchId: string; participantId: string; myReport: any; opponentReported: boolean;
  requireScreenshot: boolean;
}) {
  const router = useRouter();
  const [home, setHome] = useState(myReport?.home_score?.toString() ?? "");
  const [away, setAway] = useState(myReport?.away_score?.toString() ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let screenshotPath = myReport?.screenshot_path ?? null;

      if (file) {
        const compress = (await import("browser-image-compression")).default;
        const compressed = await compress(file, { maxSizeMB: 0.2, maxWidthOrHeight: 1600 });
        const fd = new FormData();
        fd.set("file", compressed, "score.jpg");
        const up = await uploadScreenshot(matchId, fd);
        if (up.error) throw new Error(up.error);
        screenshotPath = up.path;
      }

      if (requireScreenshot && !screenshotPath) {
        throw new Error("Une capture d'écran du score est obligatoire.");
      }

      const res = await submitReport({
        matchId, participantId,
        homeScore: Number(home), awayScore: Number(away),
        screenshotPath,
      });
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <p className="text-sm font-medium text-ink-900">
        {myReport ? "Modifier mon score" : "Saisir le score"}
      </p>
      {opponentReported && !myReport && (
        <p className="mt-1 text-xs text-gold-500">
          Ton adversaire a déjà saisi un score — vérifie-le en entrant le tien.
        </p>
      )}

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

        <label className="block text-sm text-ink-900">
          Capture d&apos;écran du score {requireScreenshot ? "" : "(optionnelle)"}
          <input
            type="file" accept="image/*" capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs text-ink-600"
          />
        </label>

        {error && <p className="text-sm text-brick-600">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Envoi..." : "Envoyer le score"}
        </Button>
      </form>
    </Card>
  );
}