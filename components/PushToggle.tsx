"use client";

import { useEffect, useState } from "react";
import { getPushStatus, subscribeToPush, unsubscribeFromPush, type PushStatus } from "@/lib/push";
import Button from "@/components/ui/Button";

export default function PushToggle() {
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  async function handleToggle() {
    setBusy(true);
    setError(null);
    const res = status === "subscribed" ? await unsubscribeFromPush() : await subscribeToPush();
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Erreur"); return; }
    setStatus(await getPushStatus());
  }

  if (status === "loading") return null;

  if (status === "unsupported") {
    return <p className="text-sm text-ink-600">Notifications non disponibles sur ce navigateur.</p>;
  }

  if (status === "denied") {
    return (
      <p className="text-sm text-ink-600">
        Notifications bloquées. Autorise-les dans les réglages de ton navigateur pour ce site.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink-900">Notifications push</p>
          <p className="text-xs text-ink-600">
            {status === "subscribed" ? "Activées sur cet appareil" : "Reçois une alerte à chaque événement important"}
          </p>
        </div>
        <Button variant={status === "subscribed" ? "secondary" : "primary"} disabled={busy} onClick={handleToggle}>
          {busy ? "..." : status === "subscribed" ? "Désactiver" : "Activer"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-brick-600">{error}</p>}
    </div>
  );
}
