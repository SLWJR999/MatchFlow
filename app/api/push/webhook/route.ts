import { NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

// Appelée par un Database Webhook Supabase configuré sur :
//   Table: notifications · Event: INSERT · Type: HTTP Request
//   URL: https://<ton-domaine>/api/push/webhook
//   En-tête: X-Webhook-Secret: <PUSH_WEBHOOK_SECRET>
//
// On ne fait confiance à AUCUNE donnée reçue sans vérifier ce secret :
// c'est la seule chose qui empêche n'importe qui d'envoyer des push à
// la place de Supabase.
export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:contact@matchflow.app";
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: "push not configured" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const payload = await request.json().catch(() => null);
  const notif = payload?.record;
  if (!notif?.profile_id) {
    return NextResponse.json({ error: "malformed payload" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("profile_id", notif.profile_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const body = JSON.stringify({
    title: notif.title,
    body: notif.body ?? "",
    link: notif.link ?? "/",
    kind: notif.kind,
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          body,
        );
        sent += 1;
      } catch (err: any) {
        // 404/410 = l'abonnement n'existe plus côté navigateur, on le retire.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("Échec d'envoi push", err?.statusCode, err?.body);
        }
      }
    }),
  );

  return NextResponse.json({ ok: true, sent, total: subs.length });
}
