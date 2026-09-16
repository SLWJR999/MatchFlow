"use client";

import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const array = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) array[i] = rawData.charCodeAt(i);
  return array.buffer;
}

export type PushStatus = "unsupported" | "denied" | "subscribed" | "unsubscribed";

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

// Demande la permission, s'abonne au service push du navigateur, puis
// enregistre l'abonnement côté Supabase (RLS : chacun ne gère que le sien).
export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return { ok: false, error: "Notifications non configurées (clé VAPID absente)." };

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "Permission refusée." };

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const json = sub.toJSON();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Connexion requise." };

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        profile_id: user.id,
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth_key: json.keys!.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? "Échec de l'abonnement." };
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };

    const endpoint = sub.endpoint;
    await sub.unsubscribe();

    const supabase = createClient();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? "Échec de la désinscription." };
  }
}
