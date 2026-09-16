import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Utilisé dans les Server Components, Server Actions et Route Handlers.
// Ne jamais utiliser côté client : il porte les cookies de session.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit
            // déjà la session, cet appel peut être ignoré sans risque.
          }
        },
      },
    },
  );
}

// Client "service_role" : contourne le RLS. Réservé aux routes serveur qui
// ont explicitement besoin d'agir pour tout le monde (ex. webhook de push).
// Sa clé ne doit JAMAIS être exposée au navigateur (pas de préfixe NEXT_PUBLIC_).
export function createServiceClient() {
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}