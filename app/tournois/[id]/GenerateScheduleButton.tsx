"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateSchedule } from "@/lib/actions";
import Button from "@/components/ui/Button";

export default function GenerateScheduleButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await generateSchedule(tournamentId);
    setLoading(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex-1">
      <Button onClick={handleClick} disabled={loading} className="w-full">
        {loading ? "Génération..." : "Lancer le tournoi"}
      </Button>
      {error && <p className="mt-1 text-xs text-brick-600">{error}</p>}
    </div>
  );
}