"use client";

import { useState } from "react";
import { updateMyProfile } from "@/lib/actions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function ProfileForm({
  initialName, initialPhone,
}: { initialName: string; initialPhone: string | null }) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await updateMyProfile(name, phone || null);
    setLoading(false);
    if (res?.error) setError(res.error);
    else setSaved(true);
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-medium text-ink-900">
          Nom affiché
          <input
            required value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-pitch-600"
          />
        </label>
        <label className="block text-sm font-medium text-ink-900">
          Téléphone
          <input
            value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+221 XX XXX XX XX"
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-pitch-600"
          />
        </label>
        {error && <p className="text-sm text-brick-600">{error}</p>}
        {saved && <p className="text-sm text-pitch-700">Profil mis à jour.</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </Card>
  );
}
