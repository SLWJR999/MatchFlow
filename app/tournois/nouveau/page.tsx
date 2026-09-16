"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTournament } from "@/lib/actions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function NouveauTournoiPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"league" | "knockout">("league");
  const [legs, setLegs] = useState<1 | 2>(1);
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [requireScreenshot, setRequireScreenshot] = useState(true);
  const [allowSelfReport, setAllowSelfReport] = useState(true);
  const [thirdPlace, setThirdPlace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [contactsVisibility, setContactsVisibility] =
    useState<"opponent_only" | "all_participants" | "hidden">("opponent_only");
  const [autoValidate, setAutoValidate] = useState(false);
  const [autoPublishRounds, setAutoPublishRounds] = useState(true);
  const [defaultVenue, setDefaultVenue] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await createTournament({
      name, format, legs, max_participants: maxParticipants,
      require_screenshot: requireScreenshot, allow_self_report: allowSelfReport,
      third_place_match: thirdPlace, contacts_visibility: contactsVisibility,
      auto_validate: autoValidate, auto_publish_rounds: autoPublishRounds,
      default_venue: defaultVenue || null, is_public: isPublic,
    });
    setLoading(false);
    if (res.error) setError(res.error);
    else router.push(`/tournois/${res.tournament.id}/participants`);
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">Nouveau tournoi</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Card className="space-y-4">
          <label className="block text-sm font-medium text-ink-900">
            Nom du tournoi
            <input
              required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Coupe du quartier"
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-pitch-600"
            />
          </label>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-900">Format</p>
            <div className="grid grid-cols-2 gap-2">
              {(["league", "knockout"] as const).map((f) => (
                <button
                  type="button" key={f} onClick={() => setFormat(f)}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${
                    format === f ? "border-pitch-700 bg-pitch-100 font-medium text-pitch-900" : "border-line text-ink-600"
                  }`}
                >
                  {f === "league" ? "Championnat" : "Élimination directe"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-900">Aller / retour</p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2].map((l) => (
                <button
                  type="button" key={l} onClick={() => setLegs(l as 1 | 2)}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${
                    legs === l ? "border-pitch-700 bg-pitch-100 font-medium text-pitch-900" : "border-line text-ink-600"
                  }`}
                >
                  {l === 1 ? "Match simple" : "Aller / retour"}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium text-ink-900">
            Nombre de joueurs max (3 à 32)
            <input
              type="number" min={3} max={32} value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-pitch-600"
            />
          </label>

          {format === "knockout" && (
            <label className="flex items-center gap-2 text-sm text-ink-900">
              <input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} />
              Match pour la 3e place
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-ink-900">
            <input type="checkbox" checked={allowSelfReport} onChange={(e) => setAllowSelfReport(e.target.checked)} />
            Les joueurs saisissent eux-mêmes leur score
          </label>

          <label className="flex items-center gap-2 text-sm text-ink-900">
            <input type="checkbox" checked={requireScreenshot} onChange={(e) => setRequireScreenshot(e.target.checked)} />
            Capture d&apos;écran obligatoire
          </label>
        </Card>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm font-medium text-pitch-700"
        >
          {showAdvanced ? "Masquer les options avancées" : "⚙️ Options avancées"}
        </button>

        {showAdvanced && (
          <Card className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-900">Qui voit les numéros ?</p>
              <select
                value={contactsVisibility}
                onChange={(e) => setContactsVisibility(e.target.value as typeof contactsVisibility)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-pitch-600"
              >
                <option value="opponent_only">Seulement l&apos;adversaire du moment</option>
                <option value="all_participants">Tous les participants</option>
                <option value="hidden">Personne (numéros masqués)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-900">
              <input type="checkbox" checked={autoValidate} onChange={(e) => setAutoValidate(e.target.checked)} />
              Valider automatiquement quand les deux scores concordent
            </label>

            {format === "league" && (
              <label className="flex items-center gap-2 text-sm text-ink-900">
                <input
                  type="checkbox" checked={autoPublishRounds}
                  onChange={(e) => setAutoPublishRounds(e.target.checked)}
                />
                Publier automatiquement la journée suivante
              </label>
            )}

            <label className="flex items-center gap-2 text-sm text-ink-900">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Page publique consultable sans compte
            </label>

            <label className="block text-sm font-medium text-ink-900">
              Lieu par défaut (optionnel)
              <input
                value={defaultVenue} onChange={(e) => setDefaultVenue(e.target.value)}
                placeholder="Ex. Terrain Fann"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-pitch-600"
              />
            </label>
          </Card>
        )}

        {error && <p className="text-sm text-brick-600">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Création..." : "Créer le tournoi"}
        </Button>
      </form>
    </div>
  );
}