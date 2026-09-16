"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addParticipant, resetClaimToken, withdrawParticipant } from "@/lib/actions";
import type { Participant } from "@/lib/types/database";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { waLink } from "@/lib/format";

export default function ParticipantsClient({
  tournamentId, tournamentStatus, initialParticipants,
}: { tournamentId: string; tournamentStatus: string; initialParticipants: Participant[] }) {
  const router = useRouter();
  const [participants, setParticipants] = useState(initialParticipants);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});

  function inviteLink(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/rejoindre/${token}`;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await addParticipant(tournamentId, name, phone || undefined);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setParticipants((p) => [...p, res.participant]);
    setName(""); setPhone("");
  }

  async function handleCopyLink(p: Participant) {
    const url = inviteLink(p.claim_token);
    setLinks((l) => ({ ...l, [p.id]: url }));
    try { await navigator.clipboard.writeText(url); } catch {}
  }

  async function handleReset(p: Participant) {
    const res = await resetClaimToken(p.id);
    if (res.ok) setLinks((l) => ({ ...l, [p.id]: inviteLink(res.token) }));
  }

  async function handleWithdraw(p: Participant) {
    if (!confirm(`Retirer ${p.display_name} du tournoi ?`)) return;
    const res = await withdrawParticipant(p.id, tournamentId);
    if (res.ok) router.refresh();
  }

  return (
    <div className="mt-4 space-y-4">
      {tournamentStatus === "draft" && (
        <Card>
          <form onSubmit={handleAdd} className="space-y-2">
            <p className="text-sm font-medium text-ink-900">Ajouter un joueur</p>
            <input
              required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Nom du joueur"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-pitch-600"
            />
            <input
              value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="Téléphone (optionnel, +221...)"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-pitch-600"
            />
            {error && <p className="text-sm text-brick-600">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Ajout..." : "Ajouter"}
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {participants.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink-900">{p.display_name}</p>
                <Badge tone={p.status === "active" ? "pitch" : p.status === "withdrawn" ? "brick" : "gold"}>
                  {p.status === "active" ? "Actif" : p.status === "withdrawn" ? "Retiré" : "En attente"}
                </Badge>
              </div>
              {tournamentStatus !== "draft" && p.status === "active" && (
                <button onClick={() => handleWithdraw(p)} className="text-xs text-brick-600">Retirer</button>
              )}
            </div>

            {!p.profile_id && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => handleCopyLink(p)}
                  className="rounded-lg bg-pitch-100 px-3 py-1.5 text-xs font-medium text-pitch-900"
                >
                  Copier le lien d'invitation
                </button>
                <button onClick={() => handleReset(p)} className="text-xs text-ink-600">
                  Régénérer
                </button>
              </div>
            )}
            {links[p.id] && (
              <div className="mt-2 flex items-center gap-2">
                <input readOnly value={links[p.id]} className="flex-1 truncate rounded-md border border-line bg-paper px-2 py-1 text-xs" />
                <a
                  href={`${waLink("")}?text=${encodeURIComponent(`Rejoins le tournoi : ${links[p.id]}`)}`}
                  target="_blank" rel="noreferrer"
                  className="text-xs font-medium text-pitch-700"
                >
                  WhatsApp
                </a>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}