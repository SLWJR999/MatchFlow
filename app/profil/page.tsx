import { redirect } from "next/navigation";
import { getCurrentUser, getMyNotifications } from "@/lib/queries";
import { signOut } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ProfileForm from "./ProfileForm";
import LinkEmailForm from "./LinkEmailForm";
import PushToggle from "@/components/PushToggle";

export default async function ProfilPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const isAnonymous = !me.user.email;
  const notifications = await getMyNotifications(15);

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      <h1 className="font-display text-2xl font-semibold text-pitch-900">Profil</h1>

      <div className="mt-4 space-y-4">
        {isAnonymous && <LinkEmailForm />}

        <ProfileForm
          initialName={me.profile?.display_name ?? "Joueur"}
          initialPhone={me.profile?.phone ?? null}
        />

        <Card>
          <PushToggle />
        </Card>

        <section>
          <h2 className="mb-2 font-display text-sm font-medium uppercase tracking-wide text-ink-600">
            Activité récente
          </h2>
          {notifications.length === 0 ? (
            <EmptyState title="Rien pour l'instant" />
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <Card key={n.id}>
                  <p className="text-sm font-medium text-ink-900">{n.title}</p>
                  {n.body && <p className="text-xs text-ink-600">{n.body}</p>}
                  <p className="mt-1 text-xs text-ink-600">{formatDate(n.created_at)}</p>
                </Card>
              ))}
            </div>
          )}
        </section>

        <form action={signOut}>
          <Button type="submit" variant="ghost" className="w-full">Se déconnecter</Button>
        </form>
      </div>
    </div>
  );
}
