"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  validateMatch, validateRound, resolveDispute, publishRound, generateFinalPhase,
} from "@/lib/actions";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { scoreLine } from "@/lib/format";
import type { Round } from "@/lib/types/database";

export default function AdminClient({
  tournamentId, tournamentFormat, tournamentStatus, pending, pendingRounds,
}: {
  tournamentId: string; tournamentFormat: string; tournamentStatus: string;
  pending: any[]; pendingRounds: Round[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [disputeDraft, setDisputeDraft] = useState<Record<string, { h: string; a: string } | undefined>>({});
  const [qualifiers, setQualifiers] = useState(4);

  async function run(id: string, fn: () => Promise<any>) {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (res?.error) alert(res.error);
    else router.refresh();
  }

  return (
    <div className="mt-4 space-y-6">
      {pendingRounds.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
            Journées à publier
          </h2>
          <div className="space-y-2">
            {pendingRounds.map((r) => (
              <Card key={r.id} className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-900">{r.name}</span>
                <Button
                  variant="secondary" disabled={busy === r.id}
                  onClick={() => run(r.id, () => publishRound(r.id, tournamentId))}
                >
                  Publier
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
          À valider / litiges
        </h2>
        {pending.length === 0 ? (
          <EmptyState title="Rien à valider pour l'instant" />
        ) : (
          <div className="space-y-3">
            {Object.entries(
              pending.reduce<Record<string, typeof pending>>((acc, m) => {
                (acc[m.round_id] ??= []).push(m);
                return acc;
              }, {}),
            ).map(([roundId, roundMatches]) => {
              const confirmedCount = roundMatches.filter((m) => m.status === "confirmed").length;
              return (
                <div key={roundId}>
                  {confirmedCount > 1 && (
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-ink-600">
                        {roundMatches[0].rounds?.name} · {confirmedCount} confirmés
                      </span>
                      <Button
                        variant="secondary" disabled={busy === roundId}
                        onClick={() => run(roundId, () => validateRound(roundId, tournamentId))}
                      >
                        Tout valider
                      </Button>
                    </div>
                  )}
                  <div className="space-y-3">
                    {roundMatches.map((m) => {
                      const myReports: { participant_id: string; home_score: number; away_score: number }[] =
                        m.match_reports ?? [];
                      const homeReport = myReports.find((r) => r.participant_id === m.home_id);
                      const awayReport = myReports.find((r) => r.participant_id === m.away_id);
                      const isSingleReport = m.status === "reported";
                      const isDisputed = m.status === "disputed";

                      return (
                        <Card key={m.id}>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-ink-900">
                              {m.home?.display_name} vs {m.away?.display_name}
                            </p>
                            <Badge tone={isDisputed ? "brick" : "gold"}>
                              {isDisputed ? "Litige" : isSingleReport ? "1 seul rapport" : "Confirmé"}
                            </Badge>
                          </div>
                          <p className="text-xs text-ink-600">{m.rounds?.name}</p>

                          {isDisputed ? (
                            <div className="mt-2 space-y-2">
                              <div className="flex justify-between text-xs text-ink-600">
                                <span>
                                  {m.home?.display_name} a déclaré :{" "}
                                  <span className="tabular-score font-medium text-ink-900">
                                    {homeReport ? scoreLine(homeReport.home_score, homeReport.away_score) : "—"}
                                  </span>
                                </span>
                              </div>
                              <div className="flex justify-between text-xs text-ink-600">
                                <span>
                                  {m.away?.display_name} a déclaré :{" "}
                                  <span className="tabular-score font-medium text-ink-900">
                                    {awayReport ? scoreLine(awayReport.home_score, awayReport.away_score) : "—"}
                                  </span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number" placeholder="Score dom." min={0}
                                  className="w-20 rounded-lg border border-line px-2 py-1.5 text-sm"
                                  value={disputeDraft[m.id]?.h ?? ""}
                                  onChange={(e) =>
                                    setDisputeDraft((d) => ({
                                      ...d, [m.id]: { h: e.target.value, a: d[m.id]?.a ?? "" },
                                    }))
                                  }
                                />
                                <span className="text-ink-600">—</span>
                                <input
                                  type="number" placeholder="Score ext." min={0}
                                  className="w-20 rounded-lg border border-line px-2 py-1.5 text-sm"
                                  value={disputeDraft[m.id]?.a ?? ""}
                                  onChange={(e) =>
                                    setDisputeDraft((d) => ({
                                      ...d, [m.id]: { h: d[m.id]?.h ?? "", a: e.target.value },
                                    }))
                                  }
                                />
                                <Button
                                  disabled={busy === m.id}
                                  onClick={() => run(m.id, () => resolveDispute({
                                    matchId: m.id, tournamentId,
                                    homeScore: Number(disputeDraft[m.id]?.h ?? 0),
                                    awayScore: Number(disputeDraft[m.id]?.a ?? 0),
                                  }))}
                                >
                                  Trancher
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 flex items-center justify-between">
                              <span className="tabular-score font-semibold">
                                {scoreLine(m.home_score, m.away_score)}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-xs text-ink-600 underline underline-offset-2"
                                  onClick={() =>
                                    setDisputeDraft((d) => ({
                                      ...d,
                                      [m.id]: d[m.id]
                                        ? undefined
                                        : { h: String(m.home_score ?? ""), a: String(m.away_score ?? "") },
                                    }))
                                  }
                                >
                                  Corriger
                                </button>
                                <Button
                                  disabled={busy === m.id}
                                  onClick={() => run(m.id, () => validateMatch(m.id, tournamentId))}
                                >
                                  Valider
                                </Button>
                              </div>
                            </div>
                          )}

                          {!isDisputed && disputeDraft[m.id] && (
                            <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
                              <input
                                type="number" placeholder="Score dom." min={0}
                                className="w-20 rounded-lg border border-line px-2 py-1.5 text-sm"
                                value={disputeDraft[m.id]?.h ?? ""}
                                onChange={(e) =>
                                  setDisputeDraft((d) => ({
                                    ...d, [m.id]: { h: e.target.value, a: d[m.id]?.a ?? "" },
                                  }))
                                }
                              />
                              <span className="text-ink-600">—</span>
                              <input
                                type="number" placeholder="Score ext." min={0}
                                className="w-20 rounded-lg border border-line px-2 py-1.5 text-sm"
                                value={disputeDraft[m.id]?.a ?? ""}
                                onChange={(e) =>
                                  setDisputeDraft((d) => ({
                                    ...d, [m.id]: { h: d[m.id]?.h ?? "", a: e.target.value },
                                  }))
                                }
                              />
                              <Button
                                disabled={busy === m.id}
                                onClick={() => run(m.id, () => resolveDispute({
                                  matchId: m.id, tournamentId,
                                  homeScore: Number(disputeDraft[m.id]?.h ?? 0),
                                  awayScore: Number(disputeDraft[m.id]?.a ?? 0),
                                }))}
                              >
                                Enregistrer
                              </Button>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {tournamentFormat === "league" && tournamentStatus === "completed" && (
        <section>
          <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
            Phase finale
          </h2>
          <Card className="space-y-2">
            <label className="block text-sm text-ink-900">
              Nombre de qualifiés
              <input
                type="number" min={2} value={qualifiers}
                onChange={(e) => setQualifiers(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
            </label>
            <Button
              disabled={busy === "final"} className="w-full"
              onClick={() => run("final", () => generateFinalPhase(tournamentId, qualifiers))}
            >
              Générer la phase finale
            </Button>
          </Card>
        </section>
      )}
    </div>
  );
}