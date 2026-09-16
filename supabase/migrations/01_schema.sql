-- =====================================================================
--  TOURNOIS FOOT — 01 · SCHÉMA
--  Postgres 15+ / Supabase
--  À exécuter en premier, dans le SQL Editor de Supabase.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------
-- TYPES
-- ---------------------------------------------------------------------
do $$ begin
  create type tournament_format as enum ('league', 'knockout');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tournament_status as enum ('draft', 'active', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_status as enum ('invited', 'active', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type round_status as enum ('pending', 'open', 'awaiting_validation', 'validated');
exception when duplicate_object then null; end $$;

-- Machine à états d'un match :
--   scheduled  : à jouer, aucun rapport
--   reported   : un seul des deux joueurs a saisi
--   confirmed  : les deux ont saisi et les scores concordent -> attend l'admin
--   disputed   : les deux ont saisi mais les scores divergent -> arbitrage admin
--   validated  : score officiel, compte au classement / fait avancer le tableau
--   walkover   : forfait prononcé par l'admin
--   cancelled  : match annulé, ne compte pas
do $$ begin
  create type match_status as enum
    ('scheduled', 'reported', 'confirmed', 'disputed', 'validated', 'walkover', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tie_status as enum ('pending', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

-- opponent_only : seul l'adversaire d'un match encore à jouer voit le numéro
-- all_participants : tout participant du tournoi voit tout le monde
-- hidden : personne ne voit personne, sauf les admins
do $$ begin
  create type contact_visibility as enum ('opponent_only', 'all_participants', 'hidden');
exception when duplicate_object then null; end $$;

-- politique appliquée aux matchs restants d'un joueur qui abandonne
do $$ begin
  create type withdrawal_policy as enum ('cancel_all', 'keep_forfeit_rest', 'freeze');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_kind as enum (
    'match_reported', 'score_disputed', 'match_validated',
    'round_published', 'next_match_ready', 'tournament_completed',
    'participant_withdrawn', 'final_phase_ready'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- PROFILES — un par compte auth (y compris les comptes anonymes)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'Joueur'
                 check (char_length(display_name) between 2 and 40),
  phone         text check (phone is null or phone ~ '^\+?[0-9 ().-]{6,20}$'),
  avatar_url    text,
  locale        text not null default 'fr',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table profiles is
  'Profil applicatif. Créé automatiquement à l''inscription, y compris pour les sessions anonymes (joueurs arrivés par lien d''invitation).';

-- ---------------------------------------------------------------------
-- TOURNAMENTS
-- ---------------------------------------------------------------------
create table if not exists tournaments (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null
                       default lower(encode(gen_random_bytes(5), 'hex')),
  name               text not null check (char_length(name) between 3 and 60),
  description        text check (description is null or char_length(description) <= 500),
  format             tournament_format not null,
  legs               smallint not null default 1 check (legs in (1, 2)),
  single_leg_final   boolean not null default true,   -- finale en match sec même en aller/retour
  status             tournament_status not null default 'draft',
  created_by         uuid not null references profiles(id) on delete restrict,
  max_participants   smallint not null default 32 check (max_participants between 2 and 32),

  -- Visibilité & inscription
  is_public          boolean not null default true,   -- consultable sans compte via /t/<slug>
  join_code          text unique
                       check (join_code is null or char_length(join_code) between 4 and 12),

  -- Règles championnat
  points_win         smallint not null default 3 check (points_win between 0 and 10),
  points_draw        smallint not null default 1 check (points_draw between 0 and 10),
  points_loss        smallint not null default 0 check (points_loss between -5 and 10),
  tiebreakers        text[] not null
                       default array['goal_diff', 'goals_for', 'head_to_head', 'wins'],

  -- Règles coupe
  away_goals_rule    boolean not null default false,
  third_place_match  boolean not null default false,

  -- Règles de saisie / validation
  require_screenshot boolean not null default true,
  auto_validate      boolean not null default false,  -- si les 2 rapports concordent, pas besoin de l'admin
  allow_self_report  boolean not null default true,   -- false = seul l'admin saisit (mode classique)
  report_deadline_h  smallint not null default 48 check (report_deadline_h between 1 and 720),

  -- Confidentialité, publication, forfaits
  contacts_visibility contact_visibility not null default 'opponent_only',
  withdrawal_policy   withdrawal_policy  not null default 'keep_forfeit_rest',
  walkover_goals      smallint not null default 3 check (walkover_goals between 1 and 20),
  default_venue       text check (default_venue is null or char_length(default_venue) <= 80),
  auto_publish_rounds boolean not null default true,  -- false = l'admin publie chaque journée à la main

  -- Phase finale enchaînée après un championnat (deux tournois liés)
  parent_tournament_id uuid references tournaments(id) on delete set null,
  qualifiers_count     smallint check (qualifiers_count between 2 and 32),

  starts_on          date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint knockout_has_no_draws
    check (format = 'league' or points_draw = 1)  -- valeur ignorée en coupe, on fige le défaut
);

create index if not exists idx_tournaments_creator on tournaments(created_by);
create index if not exists idx_tournaments_status  on tournaments(status) where status = 'active';

-- Co-administrateurs (le créateur y est inséré automatiquement)
create table if not exists tournament_admins (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  profile_id    uuid not null references profiles(id)    on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (tournament_id, profile_id)
);

-- ---------------------------------------------------------------------
-- PARTICIPANTS
--   Un participant existe indépendamment d'un compte : l'admin peut créer
--   « Moussa » et lui envoyer un lien. Le compte est rattaché plus tard
--   via claim_token (profile_id devient non nul).
-- ---------------------------------------------------------------------
create table if not exists participants (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete set null,
  display_name  text not null check (char_length(display_name) between 2 and 40),
  team_name     text check (team_name is null or char_length(team_name) <= 40),
  seed          smallint check (seed between 1 and 32),
  status        participant_status not null default 'invited',
  claim_token   uuid not null default gen_random_uuid(),
  claimed_at    timestamptz,
  withdrawn_at  timestamptz,
  created_at    timestamptz not null default now(),

  unique (tournament_id, profile_id)
);

-- Un seul « Moussa » par tournoi, insensible à la casse
create unique index if not exists uq_participant_name
  on participants (tournament_id, lower(display_name));
create unique index if not exists uq_participant_seed
  on participants (tournament_id, seed) where seed is not null;
create index if not exists idx_participants_profile on participants(profile_id);
create index if not exists idx_participants_token   on participants(claim_token);

-- Coordonnées : table séparée pour pouvoir restreindre la lecture au seul
-- adversaire du moment (RLS ne sait pas masquer une colonne).
create table if not exists participant_contacts (
  participant_id uuid primary key references participants(id) on delete cascade,
  phone          text check (phone is null or phone ~ '^\+?[0-9 ().-]{6,20}$'),
  whatsapp       text,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ROUNDS (journées de championnat / tours de coupe)
-- ---------------------------------------------------------------------
create table if not exists rounds (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  ordinal        smallint not null check (ordinal >= 1),
  name           text not null,
  leg            smallint not null default 1 check (leg in (1, 2)),
  stage          text,                       -- 'R32','R16','QF','SF','F','3P' (coupe)
  status         round_status not null default 'pending',
  scheduled_on   date,
  deadline       timestamptz,
  validated_at   timestamptz,
  validated_by   uuid references profiles(id),
  unique (tournament_id, ordinal)
);

create index if not exists idx_rounds_tournament on rounds(tournament_id, ordinal);

-- ---------------------------------------------------------------------
-- TIES (confrontations de coupe : 1 ou 2 matchs)
-- ---------------------------------------------------------------------
create table if not exists ties (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  stage          text not null,
  position       smallint not null check (position >= 1),
  participant_a  uuid references participants(id) on delete set null,
  participant_b  uuid references participants(id) on delete set null,
  winner_id      uuid references participants(id) on delete set null,
  loser_id       uuid references participants(id) on delete set null,
  next_tie_id    uuid references ties(id) on delete set null,
  next_slot      char(1) check (next_slot in ('a', 'b')),
  status         tie_status not null default 'pending',
  unique (tournament_id, stage, position)
);

create index if not exists idx_ties_tournament on ties(tournament_id);
create index if not exists idx_ties_next       on ties(next_tie_id);

-- ---------------------------------------------------------------------
-- MATCHES
-- ---------------------------------------------------------------------
create table if not exists matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  round_id       uuid not null references rounds(id) on delete cascade,
  tie_id         uuid references ties(id) on delete cascade,
  leg            smallint not null default 1 check (leg in (1, 2)),
  position       smallint not null default 1,

  home_id        uuid references participants(id) on delete cascade,
  away_id        uuid references participants(id) on delete cascade,

  home_score     smallint check (home_score between 0 and 99),
  away_score     smallint check (away_score between 0 and 99),
  home_pens      smallint check (home_pens between 0 and 99),
  away_pens      smallint check (away_pens between 0 and 99),

  status         match_status not null default 'scheduled',
  winner_id      uuid references participants(id) on delete set null,
  admin_override boolean not null default false,   -- score tranché par l'admin
  admin_note     text,

  venue          text check (venue is null or char_length(venue) <= 80),
  scheduled_at   timestamptz,
  played_at      timestamptz,
  validated_at   timestamptz,
  validated_by   uuid references profiles(id),
  created_at     timestamptz not null default now(),

  constraint no_self_match
    check (home_id is null or away_id is null or home_id <> away_id),
  constraint score_pair_complete
    check ((home_score is null) = (away_score is null)),
  unique (tie_id, leg)
);

create index if not exists idx_matches_round   on matches(round_id);
create index if not exists idx_matches_home    on matches(home_id);
create index if not exists idx_matches_away    on matches(away_id);
create index if not exists idx_matches_pending on matches(tournament_id, status)
  where status in ('scheduled', 'reported', 'confirmed', 'disputed');

-- ---------------------------------------------------------------------
-- MATCH_REPORTS — le cœur du système : chaque joueur saisit son propre score
-- ---------------------------------------------------------------------
create table if not exists match_reports (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references matches(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  reported_by     uuid references profiles(id) on delete set null,
  home_score      smallint not null check (home_score between 0 and 99),
  away_score      smallint not null check (away_score between 0 and 99),
  home_pens       smallint check (home_pens between 0 and 99),
  away_pens       smallint check (away_pens between 0 and 99),
  screenshot_path text,          -- chemin dans le bucket storage 'screenshots'
  note            text check (note is null or char_length(note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (match_id, participant_id)
);

create index if not exists idx_reports_match on match_reports(match_id);

-- ---------------------------------------------------------------------
-- JOURNAL D'ACTIVITÉ — traçabilité, règle les litiges
-- ---------------------------------------------------------------------
create table if not exists activity_log (
  id            bigserial primary key,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  actor_id      uuid references profiles(id) on delete set null,
  action        text not null,
  match_id      uuid,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_activity_tournament
  on activity_log(tournament_id, created_at desc);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS PUSH (Web Push, gratuit)
-- ---------------------------------------------------------------------
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  tournament_id uuid references tournaments(id) on delete cascade,
  kind          notification_kind not null,
  title         text not null,
  body          text,
  link          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_notifications_inbox
  on notifications(profile_id, created_at desc) where read_at is null;

-- ---------------------------------------------------------------------
-- VUE : CLASSEMENT
--   security_invoker = true -> la vue respecte le RLS de celui qui lit.
--   Le départage « confrontation directe » se fait en aval (fn_head_to_head),
--   parce qu'il ne s'exprime pas dans un simple ORDER BY.
-- ---------------------------------------------------------------------
create or replace view standings with (security_invoker = true) as
with played as (
  select m.tournament_id, m.home_id as pid, m.away_id as opp,
         m.home_score as gf, m.away_score as ga
  from matches m
  where m.status in ('validated', 'walkover')
    and m.home_id is not null and m.away_id is not null
    and m.home_score is not null
  union all
  select m.tournament_id, m.away_id, m.home_id,
         m.away_score, m.home_score
  from matches m
  where m.status in ('validated', 'walkover')
    and m.home_id is not null and m.away_id is not null
    and m.home_score is not null
),
agg as (
  select
    p.tournament_id,
    p.id                                              as participant_id,
    p.display_name,
    p.team_name,
    p.status                                          as participant_status,
    count(pl.pid)::int                                as played,
    count(*) filter (where pl.gf >  pl.ga)::int       as wins,
    count(*) filter (where pl.gf =  pl.ga)::int       as draws,
    count(*) filter (where pl.gf <  pl.ga)::int       as losses,
    coalesce(sum(pl.gf), 0)::int                      as goals_for,
    coalesce(sum(pl.ga), 0)::int                      as goals_against,
    coalesce(sum(pl.gf) - sum(pl.ga), 0)::int         as goal_diff
  from participants p
  left join played pl on pl.pid = p.id
  where p.status <> 'withdrawn'
  group by p.tournament_id, p.id, p.display_name, p.team_name, p.status
)
select
  a.*,
  (a.wins * t.points_win + a.draws * t.points_draw + a.losses * t.points_loss)::int as points,
  rank() over (
    partition by a.tournament_id
    order by (a.wins * t.points_win + a.draws * t.points_draw + a.losses * t.points_loss) desc,
             a.goal_diff desc,
             a.goals_for desc,
             a.wins desc,
             lower(a.display_name) asc
  )::int as position
from agg a
join tournaments t on t.id = a.tournament_id;

-- ---------------------------------------------------------------------
-- VUE : FORME RÉCENTE (5 derniers résultats, pour les pastilles V/N/D)
-- ---------------------------------------------------------------------
create or replace view participant_form with (security_invoker = true) as
select participant_id, tournament_id,
       array_agg(result order by played_at desc) filter (where rn <= 5) as last5
from (
  select p.id as participant_id, p.tournament_id, m.played_at,
         case when r.gf > r.ga then 'W' when r.gf = r.ga then 'D' else 'L' end as result,
         row_number() over (partition by p.id order by m.played_at desc) as rn
  from participants p
  join matches m on m.status in ('validated','walkover')
                and (m.home_id = p.id or m.away_id = p.id)
                and m.home_score is not null
  cross join lateral (
    select case when m.home_id = p.id then m.home_score else m.away_score end as gf,
           case when m.home_id = p.id then m.away_score else m.home_score end as ga
  ) r
) s
group by participant_id, tournament_id;
