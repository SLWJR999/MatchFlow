# MatchFlow

Gestion de tournois de football — championnats et coupes, saisie croisée des
scores par les joueurs, validation par l'admin, notifications push, PWA.

Next.js 16 (App Router, TypeScript) + Tailwind v4 + Supabase (Postgres, Auth,
Storage). Build vérifié (`npm run build` et lint passent tous les deux).

## 1. Créer le projet Supabase

1. Sur [supabase.com](https://supabase.com), crée un projet (offre gratuite).
2. Dans **SQL Editor**, exécute dans l'ordre les trois fichiers de
   `supabase/migrations/` : `01_schema.sql`, `02_logic.sql`, `03_security.sql`.
3. Dans **Authentication → Providers**, active *Email* (magic link), *Google*
   et **Anonymous sign-ins** — ce dernier est indispensable : c'est lui qui
   permet à un joueur invité de saisir un score sans créer de compte.
4. Dans **Authentication → URL Configuration**, ajoute l'URL de ton site
   (localhost en dev, ton domaine Vercel en prod) aux *Redirect URLs*.
5. Dans **Project Settings → API**, récupère l'URL du projet, la clé `anon`
   et la clé `service_role`.

## 2. Variables d'environnement

Copie `.env.local.example` en `.env.local` et remplis :

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # jamais exposée au navigateur
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Pour les notifications push, génère une paire de clés VAPID :

```bash
npx web-push generate-vapid-keys
```

et complète :

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:contact@matchflow.app
PUSH_WEBHOOK_SECRET=            # une chaîne aléatoire de ton choix
```

## 3. Lancer en local

```bash
npm install
npm run dev
```

## 4. Déploiement (Vercel)

1. Pousse le projet sur GitHub, importe-le dans Vercel.
2. Renseigne les mêmes variables d'environnement dans les réglages du
   projet Vercel (`NEXT_PUBLIC_SITE_URL` devient ton domaine `https://...`).
3. Déploie. Le plan gratuit Vercel + Supabase couvre largement un usage de
   plusieurs tournois simultanés avec plusieurs dizaines de joueurs.

## 5. Activer l'envoi effectif des notifications push

Le site écrit une ligne dans `notifications` à chaque événement (score saisi,
litige, résultat validé, journée publiée...). Pour que ça se traduise en vraie
notification sur le téléphone, il faut un **Database Webhook** Supabase qui
appelle la route `/api/push/webhook` de ton site à chaque insertion :

1. Dans Supabase, **Database → Webhooks → Create a new hook**.
2. Table : `notifications`. Événement : `INSERT`.
3. Type : `HTTP Request`, méthode `POST`,
   URL : `https://ton-domaine.vercel.app/api/push/webhook`.
4. Ajoute l'en-tête `X-Webhook-Secret` avec la même valeur que
   `PUSH_WEBHOOK_SECRET`. C'est ce qui empêche n'importe qui d'appeler cette
   route à la place de Supabase.

Sans ce webhook, le site fonctionne normalement — les notifications restent
visibles dans l'onglet Profil (`/profil`), simplement rien n'apparaît comme
notification système sur le téléphone.

## Structure

```
app/                  routes (App Router)
  tournois/[id]/      vue d'ensemble, matchs, classement, participants, admin
  matchs/[id]/        page « Mon match » : saisie du score + preuve
  t/[slug]/           page publique, consultable sans compte
  rejoindre/          rejoindre par code ou par lien d'invitation
  api/push/webhook/   réception du Database Webhook, envoi des push
components/           composants UI partagés (Card, Button, Badge...) + BracketView
lib/
  actions.ts          toutes les Server Actions (auth, tournois, scores, admin)
  queries.ts          toutes les lectures serveur
  push.ts             abonnement/désabonnement push côté navigateur
  supabase/           clients navigateur / serveur / service_role
  types/database.ts   types TypeScript du schéma (à remplacer par
                       `supabase gen types typescript` une fois le projet lié)
supabase/migrations/  le schéma complet, testé indépendamment (voir plus bas)
public/
  manifest.webmanifest, sw.js, icons/   PWA (icônes placeholder à remplacer)
```

## Le modèle de sécurité, en bref

Toute la logique de validation croisée des scores vit en base (RLS +
triggers), pas dans le code Next.js — l'API Supabase étant publique par
défaut, c'est la seule façon de garantir qu'un joueur ne peut pas modifier le
score d'un autre depuis la console de son navigateur. Le détail (machine à
états des matchs, pourquoi le rapport de l'adversaire reste invisible avant
qu'on ait saisi le sien, etc.) est documenté dans les commentaires SQL de
`supabase/migrations/`.

## Limites connues de cette V1

- **Icônes PWA** : celles fournies dans `public/icons/` sont des placeholders
  générés automatiquement (fond vert, initiales « MF »). À remplacer par une
  vraie identité visuelle avant de partager le lien d'installation.
- **Types Supabase** : `lib/types/database.ts` est écrit à la main. Une fois
  le projet lié (`supabase link`), lance
  `supabase gen types typescript --linked > lib/types/database.ts` pour des
  types garantis à jour — quelques `any` ponctuels dans les jointures
  disparaîtront au passage (ils sont désactivés explicitement dans
  `eslint.config.mjs`, avec la raison en commentaire).
- **Report de match** : volontairement absent de cette version (décision
  prise en cours de projet) — un joueur qui ne peut pas jouer doit être
  géré manuellement par l'admin pour l'instant.
- **Retrait d'un joueur en cours de tableau à élimination directe** : la
  fonction `withdraw_participant` gère proprement les trois politiques de
  retrait pour un championnat ; en coupe, elle marque le joueur comme retiré
  mais laisse à l'admin le soin de trancher manuellement (`declare_walkover`)
  les confrontations en attente — l'automatisation complète (avancement du
  tableau par forfait en cascade) est plus complexe et a été volontairement
  reportée.
