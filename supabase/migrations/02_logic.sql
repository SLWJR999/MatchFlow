-- =====================================================================
--  TOURNOIS FOOT — 02 · LOGIQUE MÉTIER
--  Machine à états des matchs, génération des calendriers,
--  avancement du tableau de coupe, RPC appelables depuis le client.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. UTILITAIRES
-- ---------------------------------------------------------------------

create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_profiles on profiles;
create trigger trg_touch_profiles before update on profiles
  for each row execute function fn_touch_updated_at();

drop trigger if exists trg_touch_tournaments on tournaments;
create trigger trg_touch_tournaments before update on tournaments
  for each row execute function fn_touch_updated_at();

drop trigger if exists trg_touch_reports on match_reports;
create trigger trg_touch_reports before update on match_reports
  for each row execute function fn_touch_updated_at();

-- « mode moteur » : autorise les écritures faites par les triggers/RPC
-- eux-mêmes, qui ont déjà vérifié les droits en amont.
create or replace function fn_engine_on() returns void
language sql as $$ select set_config('app.engine', '1', true); select null::void; $$;

create or replace function fn_engine_off() returns void
language sql as $$ select set_config('app.engine', '0', true); select null::void; $$;

create or replace function fn_engine_is_on() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.engine', true), '0') = '1'
$$;

-- Dépose une notification in-app. L'envoi Web Push effectif est déclenché
-- côté plateforme par un Database Webhook Supabase sur l'INSERT de cette
-- table (voir supabase/functions/send-push) : cette fonction ne fait
-- qu'écrire la ligne, elle ne connaît rien au protocole push.
create or replace function fn_notify(
  p_profile uuid, p_tournament uuid, p_kind notification_kind,
  p_title text, p_body text default null, p_link text default null
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (profile_id, tournament_id, kind, title, body, link)
  select p_profile, p_tournament, p_kind, p_title, p_body, p_link
  where p_profile is not null;
  select null::void;
$$;

-- Notifie tous les participants actifs (ayant un compte) d'un tournoi,
-- éventuellement sauf un.
create or replace function fn_notify_tournament(
  p_tournament uuid, p_kind notification_kind,
  p_title text, p_body text default null, p_link text default null,
  p_except_participant uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (profile_id, tournament_id, kind, title, body, link)
  select p.profile_id, p_tournament, p_kind, p_title, p_body, p_link
  from participants p
  where p.tournament_id = p_tournament
    and p.status = 'active'
    and p.profile_id is not null
    and (p_except_participant is null or p.id <> p_except_participant);
end $$;

create or replace function fn_notify_admins(
  p_tournament uuid, p_kind notification_kind,
  p_title text, p_body text default null, p_link text default null
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (profile_id, tournament_id, kind, title, body, link)
  select ta.profile_id, p_tournament, p_kind, p_title, p_body, p_link
  from tournament_admins ta where ta.tournament_id = p_tournament;
$$;

create or replace function log_activity(
  p_tournament uuid, p_action text, p_match uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into activity_log (tournament_id, actor_id, action, match_id, payload)
  values (p_tournament, auth.uid(), p_action, p_match, p_payload);
  select null::void;
$$;

-- ---------------------------------------------------------------------
-- 1. CRÉATION AUTOMATIQUE DU PROFIL
-- ---------------------------------------------------------------------
create or replace function fn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Joueur'
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function fn_handle_new_user();

-- Le créateur d'un tournoi en devient administrateur
create or replace function fn_tournament_creator_is_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into tournament_admins (tournament_id, profile_id)
  values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_tournament_creator on tournaments;
create trigger trg_tournament_creator after insert on tournaments
  for each row execute function fn_tournament_creator_is_admin();

-- ---------------------------------------------------------------------
-- 2. FONCTIONS D'AUTORISATION (utilisées par les politiques RLS)
--    SECURITY DEFINER => elles contournent le RLS, ce qui évite
--    les récursions infinies dans les politiques.
-- ---------------------------------------------------------------------

create or replace function is_real_user() returns boolean
language sql stable as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

create or replace function is_tournament_admin(p_tournament uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tournament_admins ta
    where ta.tournament_id = p_tournament and ta.profile_id = auth.uid()
  )
$$;

create or replace function my_participant_id(p_tournament uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from participants p
  where p.tournament_id = p_tournament
    and p.profile_id = auth.uid()
    and p.status <> 'withdrawn'
  limit 1
$$;

create or replace function is_participant(p_tournament uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select my_participant_id(p_tournament) is not null
$$;

create or replace function tournament_is_public(p_tournament uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select t.is_public from tournaments t where t.id = p_tournament), false)
$$;

create or replace function can_see_tournament(p_tournament uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select tournament_is_public(p_tournament)
      or is_participant(p_tournament)
      or is_tournament_admin(p_tournament)
$$;

-- Visibilité des numéros, pilotée par tournaments.contacts_visibility :
--   opponent_only    : soi-même, les admins, et l'adversaire d'un match
--                       encore à jouer ou en litige (défaut, le plus prudent)
--   all_participants : tout participant actif du tournoi
--   hidden           : personne à part les admins et l'intéressé lui-même
create or replace function can_see_contact(p_participant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from participants p
    join tournaments t on t.id = p.tournament_id
    where p.id = p_participant
      and (
        p.profile_id = auth.uid()
        or is_tournament_admin(p.tournament_id)
        or (
          t.contacts_visibility = 'all_participants'
          and is_participant(p.tournament_id)
        )
        or (
          t.contacts_visibility = 'opponent_only'
          and exists (
            select 1 from matches m
            where m.tournament_id = p.tournament_id
              and m.status in ('scheduled', 'reported', 'disputed')
              and (
                (m.home_id = p.id and m.away_id = my_participant_id(p.tournament_id))
                or
                (m.away_id = p.id and m.home_id = my_participant_id(p.tournament_id))
              )
          )
        )
      )
  )
$$;

-- Le joueur peut-il saisir le score de ce match ?
create or replace function can_report_match(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from matches m
    join tournaments t on t.id = m.tournament_id
    where m.id = p_match
      and m.status in ('scheduled', 'reported', 'confirmed', 'disputed')
      and (
        is_tournament_admin(m.tournament_id)
        or (
          t.allow_self_report
          and my_participant_id(m.tournament_id) in (m.home_id, m.away_id)
        )
      )
  )
$$;

-- Faut-il des tirs au but pour départager, compte tenu du score proposé ?
create or replace function fn_tie_needs_pens(p_match uuid, p_home int, p_away int)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_m matches; v_t tournaments; v_tie ties;
  v_legs int; l1 matches;
  agg_a int; agg_b int; away_a int; away_b int;
begin
  select * into v_m from matches where id = p_match;
  if v_m.tie_id is null then return false; end if;
  select * into v_t from tournaments where id = v_m.tournament_id;
  select * into v_tie from ties where id = v_m.tie_id;

  select count(*) into v_legs from matches where tie_id = v_m.tie_id;
  if v_m.leg <> v_legs then return false; end if;   -- pas la manche décisive

  if v_legs = 1 then
    return p_home = p_away;
  end if;

  select * into l1 from matches where tie_id = v_m.tie_id and leg = 1;
  if l1.status not in ('validated', 'walkover') or l1.home_score is null then
    return false;    -- l'aller n'est pas encore officiel, on ne peut pas trancher
  end if;

  -- manche retour : le receveur est participant_b
  agg_a  := l1.home_score + p_away;
  agg_b  := l1.away_score + p_home;
  away_a := p_away;
  away_b := l1.away_score;

  if agg_a <> agg_b then return false; end if;
  if v_t.away_goals_rule and away_a <> away_b then return false; end if;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 3. GARDE-FOU SUR LES RAPPORTS
-- ---------------------------------------------------------------------
create or replace function fn_check_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_m matches;
  v_t tournaments;
  v_is_admin boolean;
begin
  select * into v_m from matches where id = new.match_id;
  if not found then raise exception 'Match introuvable'; end if;
  select * into v_t from tournaments where id = v_m.tournament_id;
  v_is_admin := is_tournament_admin(v_m.tournament_id);

  if v_m.status in ('validated', 'walkover', 'cancelled') and not v_is_admin then
    raise exception 'Ce match est clôturé (%), la saisie n''est plus possible.', v_m.status
      using errcode = 'check_violation';
  end if;

  if new.participant_id not in (v_m.home_id, v_m.away_id) then
    raise exception 'Ce joueur ne participe pas à ce match.'
      using errcode = 'check_violation';
  end if;

  -- Le rapport doit émaner du joueur concerné, ou d'un admin
  if not v_is_admin then
    if new.participant_id <> my_participant_id(v_m.tournament_id) then
      raise exception 'Vous ne pouvez saisir que votre propre rapport.'
        using errcode = 'insufficient_privilege';
    end if;
    if not v_t.allow_self_report then
      raise exception 'Seul l''administrateur saisit les scores dans ce tournoi.'
        using errcode = 'insufficient_privilege';
    end if;
    if v_t.require_screenshot and coalesce(new.screenshot_path, '') = '' then
      raise exception 'Une capture d''écran du score est obligatoire dans ce tournoi.'
        using errcode = 'check_violation';
    end if;
    if v_m.scheduled_at is not null
       and now() > v_m.scheduled_at + make_interval(hours => v_t.report_deadline_h) then
      raise exception 'Le délai de saisie est dépassé, contactez l''administrateur.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- En coupe, si la manche décisive laisse les deux joueurs à égalité
  -- (au cumul, règle des buts à l'extérieur appliquée), les tirs au but
  -- sont obligatoires.
  if fn_tie_needs_pens(v_m.id, new.home_score, new.away_score)
     and (new.home_pens is null or new.away_pens is null
          or new.home_pens = new.away_pens) then
    raise exception 'Égalité : renseignez le score des tirs au but.'
      using errcode = 'check_violation';
  end if;

  new.reported_by := coalesce(new.reported_by, auth.uid());
  return new;
end $$;

drop trigger if exists trg_check_report on match_reports;
create trigger trg_check_report before insert or update on match_reports
  for each row execute function fn_check_report();

-- ---------------------------------------------------------------------
-- 4. MACHINE À ÉTATS : les rapports pilotent le statut du match
-- ---------------------------------------------------------------------
create or replace function fn_sync_match_from_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_m       matches;
  v_t       tournaments;
  r_home    match_reports;
  r_away    match_reports;
  n_reports int := 0;
  v_status  match_status;
  v_match_id uuid := coalesce(new.match_id, old.match_id);
begin
  select * into v_m from matches where id = v_match_id;
  if not found then return coalesce(new, old); end if;
  select * into v_t from tournaments where id = v_m.tournament_id;

  select * into r_home from match_reports
    where match_id = v_match_id and participant_id = v_m.home_id;
  select * into r_away from match_reports
    where match_id = v_match_id and participant_id = v_m.away_id;

  n_reports := (case when r_home.id is not null then 1 else 0 end)
             + (case when r_away.id is not null then 1 else 0 end);

  perform fn_engine_on();

  if v_m.admin_override then
    -- l'admin a tranché : on ne touche plus à rien
    null;

  elsif n_reports = 0 then
    update matches set status = 'scheduled',
           home_score = null, away_score = null,
           home_pens = null, away_pens = null,
           winner_id = null, played_at = null,
           validated_at = null, validated_by = null
    where id = v_match_id;

  elsif n_reports = 1 then
    -- Le score déclaré s'affiche tout de suite (marqué "en attente" côté
    -- statut) : on ne fait plus attendre tout le monde derrière l'adversaire
    -- qui ne rentre jamais son score. L'admin peut valider ce score seul
    -- dès qu'il le souhaite (voir validate_match) ; si l'adversaire saisit
    -- ensuite un score différent, ça repasse en litige.
    update matches set status = 'reported',
           home_score = coalesce(r_home.home_score, r_away.home_score),
           away_score = coalesce(r_home.away_score, r_away.away_score),
           home_pens  = coalesce(r_home.home_pens, r_away.home_pens),
           away_pens  = coalesce(r_home.away_pens, r_away.away_pens),
           winner_id = null
    where id = v_match_id;

    declare
      v_reporter uuid := coalesce(r_home.participant_id, r_away.participant_id);
      v_opponent uuid := case when v_reporter = v_m.home_id then v_m.away_id else v_m.home_id end;
      v_opponent_profile uuid; v_reporter_name text;
    begin
      select profile_id into v_opponent_profile from participants where id = v_opponent;
      select display_name into v_reporter_name from participants where id = v_reporter;
      perform fn_notify(v_opponent_profile, v_m.tournament_id, 'match_reported',
        v_reporter_name || ' a saisi le score de votre match',
        'Confirmez ou signalez un désaccord.',
        '/tournois/' || v_m.tournament_id || '/matchs/' || v_match_id);
    end;

  else
    if r_home.home_score = r_away.home_score
       and r_home.away_score = r_away.away_score
       and coalesce(r_home.home_pens, -1) = coalesce(r_away.home_pens, -1)
       and coalesce(r_home.away_pens, -1) = coalesce(r_away.away_pens, -1)
    then
      v_status := case when v_t.auto_validate then 'validated'::match_status
                       else 'confirmed'::match_status end;

      update matches set
        status       = v_status,
        home_score   = r_home.home_score,
        away_score   = r_home.away_score,
        home_pens    = r_home.home_pens,
        away_pens    = r_home.away_pens,
        played_at    = coalesce(played_at, now()),
        validated_at = case when v_status = 'validated' then now() end,
        validated_by = case when v_status = 'validated' then auth.uid() end
      where id = v_match_id;
    else
      update matches set status = 'disputed',
             home_score = null, away_score = null,
             home_pens = null, away_pens = null, winner_id = null
      where id = v_match_id;

      if v_m.status is distinct from 'disputed' then
        perform fn_notify_admins(v_m.tournament_id, 'score_disputed',
          'Litige sur un score à trancher',
          r_home.home_score || '-' || r_home.away_score || ' déclaré par un joueur, '
            || r_away.home_score || '-' || r_away.away_score || ' par l''autre.',
          '/admin/' || v_m.tournament_id || '/litiges');
      end if;
    end if;
  end if;

  perform fn_engine_off();

  perform log_activity(
    v_m.tournament_id,
    case tg_op when 'DELETE' then 'report_deleted' else 'report_submitted' end,
    v_match_id,
    jsonb_build_object('reports', n_reports)
  );

  return coalesce(new, old);
end $$;

drop trigger if exists trg_sync_match on match_reports;
create trigger trg_sync_match after insert or update or delete on match_reports
  for each row execute function fn_sync_match_from_reports();

-- ---------------------------------------------------------------------
-- 4bis. VAINQUEUR DU MATCH — calculé avant écriture, jamais à la main
-- ---------------------------------------------------------------------
create or replace function fn_compute_match_winner() returns trigger
language plpgsql as $$
begin
  if new.status in ('validated', 'walkover') and new.home_score is not null then
    new.winner_id := case
      when new.home_score > new.away_score then new.home_id
      when new.away_score > new.home_score then new.away_id
      when coalesce(new.home_pens, -1) > coalesce(new.away_pens, -1) then new.home_id
      when coalesce(new.away_pens, -1) > coalesce(new.home_pens, -1) then new.away_id
      else null
    end;
  else
    new.winner_id := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_aa_match_winner on matches;
create trigger trg_aa_match_winner before insert or update on matches
  for each row execute function fn_compute_match_winner();

-- ---------------------------------------------------------------------
-- 5. TRANSITIONS AUTORISÉES SUR UN MATCH
-- ---------------------------------------------------------------------
create or replace function fn_guard_match_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if fn_engine_is_on() then
    return new;
  end if;

  if not is_tournament_admin(new.tournament_id) then
    raise exception 'Seul un administrateur du tournoi peut modifier un match.'
      using errcode = 'insufficient_privilege';
  end if;

  if old.status <> new.status then
    if not (
         (old.status in ('confirmed', 'disputed', 'reported', 'scheduled')
            and new.status in ('validated', 'walkover', 'cancelled'))
      or (old.status in ('validated', 'walkover', 'cancelled')
            and new.status in ('scheduled', 'reported', 'confirmed', 'disputed'))
    ) then
      raise exception 'Transition de statut interdite : % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;

    -- on ne dévalide pas un match dont le vainqueur est déjà passé au tour suivant
    if old.status = 'validated' and old.tie_id is not null then
      if exists (
        select 1 from ties t
        where t.id = old.tie_id and t.status = 'completed'
          and exists (select 1 from ties nt
                      where nt.id = t.next_tie_id and nt.status <> 'pending')
      ) then
        raise exception 'Le tour suivant a déjà commencé, impossible de revenir sur ce match.'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.status in ('validated', 'walkover') and new.home_score is null then
    raise exception 'Un match validé doit avoir un score.'
      using errcode = 'check_violation';
  end if;

  if new.status = 'validated' and old.status <> 'validated' then
    new.validated_at := now();
    new.validated_by := auth.uid();
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_match on matches;
create trigger trg_guard_match before update on matches
  for each row execute function fn_guard_match_update();

-- ---------------------------------------------------------------------
-- 6. APRÈS VALIDATION : vainqueur, journée, tableau, fin de tournoi
-- ---------------------------------------------------------------------

create or replace function fn_recompute_round_status(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds; v_t tournaments;
  v_total int; v_done int; v_settled int;
  v_was_validated boolean;
begin
  select * into v_round from rounds where id = p_round;
  if not found then return; end if;
  select * into v_t from tournaments where id = v_round.tournament_id;

  -- Une journée de championnat non encore publiée reste 'pending' même si
  -- ses matchs existent déjà (le calendrier entier est généré d'un coup).
  if v_t.format = 'league' and v_round.status = 'pending' then
    return;
  end if;

  select count(*),
         count(*) filter (where status in ('validated', 'walkover', 'cancelled')),
         count(*) filter (where status in ('validated', 'walkover', 'cancelled', 'confirmed'))
    into v_total, v_done, v_settled
  from matches where round_id = p_round;

  v_was_validated := (v_round.status = 'validated');

  update rounds set
    status = case
      when v_total = 0         then 'pending'::round_status
      when v_done = v_total    then 'validated'::round_status
      when v_settled = v_total then 'awaiting_validation'::round_status
      else 'open'::round_status
    end,
    validated_at = case when v_done = v_total then coalesce(v_round.validated_at, now()) end
  where id = p_round;

  if v_t.format = 'league' and v_total > 0 and v_done = v_total and not v_was_validated
     and v_t.auto_publish_rounds then
    perform fn_publish_next_round(v_round.tournament_id, v_round.ordinal);
  end if;
end $$;

-- Ouvre la journée suivante d'un championnat (auto ou déclenché par un admin)
create or replace function fn_publish_next_round(p_tournament uuid, p_current_ordinal int)
returns void language plpgsql security definer set search_path = public as $$
declare v_next rounds;
begin
  select * into v_next from rounds
    where tournament_id = p_tournament and ordinal = p_current_ordinal + 1;
  if not found or v_next.status <> 'pending' then return; end if;

  update rounds set status = 'open'::round_status where id = v_next.id;

  perform fn_notify_tournament(p_tournament, 'round_published',
    v_next.name || ' est disponible',
    'Vos matchs de cette journée sont prêts.',
    '/tournois/' || p_tournament || '/matchs');
end $$;

-- Crée les matchs d'une confrontation dès que les deux qualifiés sont connus
create or replace function fn_materialize_tie(p_tie uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tie  ties;
  v_t    tournaments;
  v_legs int;
  v_round uuid;
  l int;
  v_home uuid; v_away uuid;
begin
  select * into v_tie from ties where id = p_tie;
  if v_tie.participant_a is null or v_tie.participant_b is null then return; end if;
  if exists (select 1 from matches where tie_id = p_tie) then return; end if;

  select * into v_t from tournaments where id = v_tie.tournament_id;
  v_legs := case when v_t.legs = 2 and not (v_tie.stage in ('F','3P') and v_t.single_leg_final)
                 then 2 else 1 end;

  perform fn_engine_on();
  for l in 1..v_legs loop
    select id into v_round from rounds
      where tournament_id = v_tie.tournament_id and stage = v_tie.stage and leg = l;

    if l = 1 then v_home := v_tie.participant_a; v_away := v_tie.participant_b;
    else          v_home := v_tie.participant_b; v_away := v_tie.participant_a;
    end if;

    insert into matches (tournament_id, round_id, tie_id, leg, position, home_id, away_id)
    values (v_tie.tournament_id, v_round, p_tie, l, v_tie.position, v_home, v_away);

    perform fn_recompute_round_status(v_round);
  end loop;

  update ties set status = 'in_progress' where id = p_tie;
  perform fn_engine_off();

  perform fn_notify(
    (select profile_id from participants where id = v_tie.participant_a),
    v_tie.tournament_id, 'next_match_ready', 'Ton prochain match est prêt',
    'Tu affrontes ' || (select display_name from participants where id = v_tie.participant_b) || '.',
    '/tournois/' || v_tie.tournament_id || '/matchs');
  perform fn_notify(
    (select profile_id from participants where id = v_tie.participant_b),
    v_tie.tournament_id, 'next_match_ready', 'Ton prochain match est prêt',
    'Tu affrontes ' || (select display_name from participants where id = v_tie.participant_a) || '.',
    '/tournois/' || v_tie.tournament_id || '/matchs');
end $$;

-- Place un qualifié dans la confrontation suivante
create or replace function fn_place_in_tie(p_tie uuid, p_slot char, p_participant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tie is null or p_participant is null then return; end if;
  if p_slot = 'a' then
    update ties set participant_a = p_participant where id = p_tie;
  else
    update ties set participant_b = p_participant where id = p_tie;
  end if;
  perform fn_settle_bye(p_tie);
  perform fn_materialize_tie(p_tie);
end $$;

-- Un seul inscrit dans la confrontation => qualification d'office
create or replace function fn_settle_bye(p_tie uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_tie ties; v_prev_done boolean;
begin
  select * into v_tie from ties where id = p_tie;
  if v_tie.status = 'completed' then return; end if;

  -- exempt seulement si l'autre place ne peut plus être remplie
  select not exists (
    select 1 from ties s where s.next_tie_id = p_tie and s.status <> 'completed'
  ) into v_prev_done;
  if not v_prev_done then return; end if;

  if (v_tie.participant_a is null) <> (v_tie.participant_b is null) then
    update ties set
      winner_id = coalesce(v_tie.participant_a, v_tie.participant_b),
      status = 'completed'
    where id = p_tie;
    perform fn_place_in_tie(v_tie.next_tie_id, v_tie.next_slot,
                            coalesce(v_tie.participant_a, v_tie.participant_b));
  end if;
end $$;

-- Détermine le vainqueur d'une confrontation et fait avancer le tableau
create or replace function fn_settle_tie(p_tie uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tie ties; v_t tournaments;
  v_n int; v_done int;
  l1 matches; l2 matches;
  agg_a int; agg_b int; away_a int; away_b int;
  v_winner uuid; v_loser uuid;
  v_3p uuid;
begin
  select * into v_tie from ties where id = p_tie;
  if v_tie.status = 'completed' then return; end if;
  select * into v_t from tournaments where id = v_tie.tournament_id;

  select count(*), count(*) filter (where status in ('validated', 'walkover'))
    into v_n, v_done
  from matches where tie_id = p_tie;
  if v_n = 0 or v_done < v_n then return; end if;

  select * into l1 from matches where tie_id = p_tie and leg = 1;

  if v_n = 1 then
    agg_a := l1.home_score; agg_b := l1.away_score;
    away_a := 0; away_b := 0;
  else
    select * into l2 from matches where tie_id = p_tie and leg = 2;
    agg_a := l1.home_score + l2.away_score;   -- A reçoit à l'aller
    agg_b := l1.away_score + l2.home_score;
    away_a := l2.away_score;                  -- buts de A à l'extérieur
    away_b := l1.away_score;
  end if;

  if agg_a > agg_b then
    v_winner := v_tie.participant_a; v_loser := v_tie.participant_b;
  elsif agg_b > agg_a then
    v_winner := v_tie.participant_b; v_loser := v_tie.participant_a;
  elsif v_t.away_goals_rule and v_n = 2 and away_a <> away_b then
    if away_a > away_b then
      v_winner := v_tie.participant_a; v_loser := v_tie.participant_b;
    else
      v_winner := v_tie.participant_b; v_loser := v_tie.participant_a;
    end if;
  else
    -- tirs au but sur la dernière manche
    declare last_m matches;
    begin
      select * into last_m from matches where tie_id = p_tie order by leg desc limit 1;
      if last_m.home_pens is null or last_m.away_pens is null
         or last_m.home_pens = last_m.away_pens then
        -- égalité parfaite sans tirs au but : l'admin doit trancher
        perform log_activity(v_tie.tournament_id, 'tie_needs_pens', last_m.id,
                             jsonb_build_object('tie', p_tie));
        return;
      end if;
      if (last_m.home_id = v_tie.participant_a) = (last_m.home_pens > last_m.away_pens) then
        v_winner := v_tie.participant_a; v_loser := v_tie.participant_b;
      else
        v_winner := v_tie.participant_b; v_loser := v_tie.participant_a;
      end if;
    end;
  end if;

  update ties set winner_id = v_winner, loser_id = v_loser, status = 'completed'
  where id = p_tie;

  perform fn_place_in_tie(v_tie.next_tie_id, v_tie.next_slot, v_winner);

  -- petite finale alimentée par les perdants des demies
  if v_tie.stage = 'SF' and v_t.third_place_match then
    select id into v_3p from ties
      where tournament_id = v_tie.tournament_id and stage = '3P' limit 1;
    if v_3p is not null then
      perform fn_place_in_tie(v_3p, case when v_tie.position = 1 then 'a' else 'b' end, v_loser);
    end if;
  end if;

  if v_tie.stage = 'F' then
    update tournaments set status = 'completed' where id = v_tie.tournament_id;
    perform log_activity(v_tie.tournament_id, 'tournament_completed', null,
                         jsonb_build_object('winner', v_winner));
    perform fn_notify_tournament(v_tie.tournament_id, 'tournament_completed',
      'Le tournoi est terminé',
      (select display_name from participants where id = v_winner) || ' remporte le tournoi !',
      '/tournois/' || v_tie.tournament_id);
  end if;
end $$;

create or replace function fn_after_match_settled() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_remaining int; v_rows int; v_became_completed boolean;
  v_hp uuid; v_ap uuid; v_hn text; v_an text;
begin
  if new.status = old.status then return new; end if;

  perform fn_recompute_round_status(new.round_id);

  if new.tie_id is not null then
    perform fn_settle_tie(new.tie_id);
  end if;

  if new.status in ('validated', 'walkover') and new.home_score is not null then
    select profile_id, display_name into v_hp, v_hn from participants where id = new.home_id;
    select profile_id, display_name into v_ap, v_an from participants where id = new.away_id;
    perform fn_notify(v_hp, new.tournament_id, 'match_validated',
      'Résultat officiel : ' || new.home_score || '-' || new.away_score,
      'Contre ' || coalesce(v_an, 'ton adversaire') || '.',
      '/tournois/' || new.tournament_id || '/matchs');
    perform fn_notify(v_ap, new.tournament_id, 'match_validated',
      'Résultat officiel : ' || new.away_score || '-' || new.home_score,
      'Contre ' || coalesce(v_hn, 'ton adversaire') || '.',
      '/tournois/' || new.tournament_id || '/matchs');
  end if;

  -- championnat terminé ?
  if new.status in ('validated', 'walkover', 'cancelled') then
    select count(*) into v_remaining from matches
      where tournament_id = new.tournament_id
        and status not in ('validated', 'walkover', 'cancelled');
    if v_remaining = 0 then
      update tournaments set status = 'completed'
        where id = new.tournament_id and status = 'active';
      get diagnostics v_rows = row_count;
      v_became_completed := v_rows > 0;
      if v_became_completed then
        perform fn_notify_tournament(new.tournament_id, 'tournament_completed',
          'Le tournoi est terminé', 'Consultez le classement final.',
          '/tournois/' || new.tournament_id);
      end if;
    end if;
  end if;

  perform log_activity(new.tournament_id, 'match_' || new.status, new.id,
    jsonb_build_object('score', new.home_score || '-' || new.away_score));

  return new;
end $$;

drop trigger if exists trg_after_match on matches;
create trigger trg_after_match after update of status on matches
  for each row execute function fn_after_match_settled();

-- ---------------------------------------------------------------------
-- 7. GÉNÉRATION DU CALENDRIER — CHAMPIONNAT (méthode de Berger)
-- ---------------------------------------------------------------------
create or replace function fn_generate_league(p_tournament uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_t tournaments;
  ids uuid[]; nn int; half int;
  r int; i int; leg int; ord int := 0;
  a uuid; b uuid; tmp uuid;
  v_round uuid; v_created int := 0;
begin
  select * into v_t from tournaments where id = p_tournament;

  select array_agg(id order by coalesce(seed, 999), lower(display_name))
    into ids
  from participants where tournament_id = p_tournament and status <> 'withdrawn';

  nn := coalesce(array_length(ids, 1), 0);
  if nn < 2 then raise exception 'Il faut au moins 2 participants (actuellement %).', nn; end if;
  if nn % 2 = 1 then ids := ids || array[null::uuid]; nn := nn + 1; end if;
  half := nn / 2;

  perform fn_engine_on();

  for leg in 1..v_t.legs loop
    -- on repart de l'ordre initial à chaque manche
    select array_agg(id order by coalesce(seed, 999), lower(display_name)) into ids
      from participants where tournament_id = p_tournament and status <> 'withdrawn';
    if array_length(ids, 1) % 2 = 1 then ids := ids || array[null::uuid]; end if;

    for r in 1..(nn - 1) loop
      ord := ord + 1;
      insert into rounds (tournament_id, ordinal, name, leg, status)
      values (p_tournament, ord,
              case when v_t.legs = 2
                   then format('Journée %s (%s)', r, case leg when 1 then 'aller' else 'retour' end)
                   else format('Journée %s', r) end,
              leg, case when ord = 1 then 'open'::round_status else 'pending'::round_status end)
      returning id into v_round;

      for i in 1..half loop
        a := ids[i]; b := ids[nn + 1 - i];
        -- alternance domicile/extérieur, inversée au retour
        if (r % 2 = 0) <> (leg = 2) then tmp := a; a := b; b := tmp; end if;

        if a is not null and b is not null then
          insert into matches (tournament_id, round_id, home_id, away_id, position)
          values (p_tournament, v_round, a, b, i);
          v_created := v_created + 1;
        end if;
      end loop;

      -- rotation : le premier reste fixe, les autres tournent
      ids := array[ids[1]] || ids[nn:nn] || ids[2:nn-1];
    end loop;
  end loop;

  update tournaments set status = 'active' where id = p_tournament;
  perform fn_engine_off();
  perform log_activity(p_tournament, 'schedule_generated', null,
                       jsonb_build_object('matches', v_created));
  return v_created;
end $$;

-- ---------------------------------------------------------------------
-- 8. GÉNÉRATION DU TABLEAU — COUPE
-- ---------------------------------------------------------------------
create or replace function fn_stage_label(p_ties int) returns text
language sql immutable as $$
  select case p_ties
    when 1 then 'F' when 2 then 'SF' when 4 then 'QF'
    when 8 then 'R16' when 16 then 'R32'
    else 'R' || (p_ties * 2)::text end
$$;

create or replace function fn_generate_knockout(p_tournament uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_t tournaments;
  ids uuid[]; n int; size int; levels int;
  seed_order int[]; tmp int[];
  s int; i int; num int; leg int; ord int := 0;
  level_ids uuid[]; prev_ids uuid[];
  v_tie uuid; v_created int := 0;
  v_stage text; v_3p uuid;
begin
  select * into v_t from tournaments where id = p_tournament;

  select array_agg(id order by coalesce(seed, 999), lower(display_name)) into ids
    from participants where tournament_id = p_tournament and status <> 'withdrawn';
  n := coalesce(array_length(ids, 1), 0);
  if n < 2 then raise exception 'Il faut au moins 2 participants (actuellement %).', n; end if;

  size := 2;
  while size < n loop size := size * 2; end loop;
  levels := 0;
  while 2 ^ levels < size loop levels := levels + 1; end loop;

  perform fn_engine_on();

  -- 8.1 les tours, du premier au dernier
  for s in reverse levels..1 loop
    num := (2 ^ (s - 1))::int;
    v_stage := fn_stage_label(num);
    for leg in 1..(case when v_t.legs = 2
                          and not (v_stage = 'F' and v_t.single_leg_final)
                        then 2 else 1 end) loop
      ord := ord + 1;
      insert into rounds (tournament_id, ordinal, name, leg, stage, status)
      values (p_tournament, ord,
        case v_stage
          when 'F'  then 'Finale' when 'SF' then 'Demi-finales'
          when 'QF' then 'Quarts de finale' when 'R16' then 'Huitièmes de finale'
          when 'R32' then 'Seizièmes de finale' else v_stage end
        || case when v_t.legs = 2 and v_stage <> 'F'
                then case leg when 1 then ' — aller' else ' — retour' end
                else '' end,
        leg, v_stage, case when s = levels then 'open'::round_status
                          else 'pending'::round_status end);
    end loop;
  end loop;

  if v_t.third_place_match and levels >= 2 then
    ord := ord + 1;
    insert into rounds (tournament_id, ordinal, name, leg, stage, status)
    values (p_tournament, ord, 'Match pour la 3e place', 1, '3P', 'pending'::round_status);
  end if;

  -- 8.2 les confrontations, de la finale vers le premier tour (pour chaîner next_tie_id)
  prev_ids := null;
  for s in 1..levels loop
    num := (2 ^ (s - 1))::int;
    level_ids := array[]::uuid[];
    for i in 1..num loop
      insert into ties (tournament_id, stage, position, next_tie_id, next_slot)
      values (p_tournament, fn_stage_label(num), i,
              case when s = 1 then null else prev_ids[((i + 1) / 2)::int] end,
              case when s = 1 then null
                   when i % 2 = 1 then 'a' else 'b' end)
      returning id into v_tie;
      level_ids := level_ids || v_tie;
    end loop;
    prev_ids := level_ids;
  end loop;
  -- prev_ids contient désormais les confrontations du premier tour

  if v_t.third_place_match and levels >= 2 then
    insert into ties (tournament_id, stage, position) values (p_tournament, '3P', 1)
    returning id into v_3p;
  end if;

  -- 8.3 ordre des têtes de série : 1-16, 8-9, 5-12, 4-13, ...
  seed_order := array[1];
  while array_length(seed_order, 1) < size loop
    tmp := array[]::int[];
    for i in 1..array_length(seed_order, 1) loop
      tmp := tmp || seed_order[i]
                 || (2 * array_length(seed_order, 1) + 1 - seed_order[i]);
    end loop;
    seed_order := tmp;
  end loop;

  -- 8.4 placement des joueurs + exemptions
  for i in 1..(size / 2) loop
    update ties set
      participant_a = case when seed_order[2*i - 1] <= n then ids[seed_order[2*i - 1]] end,
      participant_b = case when seed_order[2*i]     <= n then ids[seed_order[2*i]] end
    where id = prev_ids[i];
  end loop;

  perform fn_engine_off();

  for i in 1..(size / 2) loop
    perform fn_settle_bye(prev_ids[i]);
    perform fn_materialize_tie(prev_ids[i]);
  end loop;

  select count(*) into v_created from matches where tournament_id = p_tournament;
  update tournaments set status = 'active' where id = p_tournament;
  perform log_activity(p_tournament, 'bracket_generated', null,
                       jsonb_build_object('size', size, 'participants', n));
  return v_created;
end $$;

-- ---------------------------------------------------------------------
-- 9. RPC APPELABLES DEPUIS LE CLIENT
-- ---------------------------------------------------------------------

-- 9.1 Réclamer une place via un lien d'invitation
create or replace function claim_participant(p_token uuid)
returns participants
language plpgsql security definer set search_path = public as $$
declare v_p participants;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise (même anonyme).' using errcode = 'insufficient_privilege';
  end if;

  select * into v_p from participants where claim_token = p_token;
  if not found then
    raise exception 'Lien d''invitation invalide ou expiré.' using errcode = 'no_data_found';
  end if;

  if v_p.profile_id is not null and v_p.profile_id <> auth.uid() then
    raise exception 'Cette place a déjà été prise. Demandez un nouveau lien à l''administrateur.'
      using errcode = 'unique_violation';
  end if;

  if exists (select 1 from participants x
             where x.tournament_id = v_p.tournament_id
               and x.profile_id = auth.uid() and x.id <> v_p.id) then
    raise exception 'Vous participez déjà à ce tournoi.' using errcode = 'unique_violation';
  end if;

  perform fn_engine_on();
  update participants
    set profile_id = auth.uid(), claimed_at = coalesce(claimed_at, now()), status = 'active'
  where id = v_p.id
  returning * into v_p;
  perform fn_engine_off();

  perform log_activity(v_p.tournament_id, 'participant_claimed', null,
                       jsonb_build_object('participant', v_p.id));
  return v_p;
end $$;

-- 9.2 Rejoindre un tournoi ouvert avec un code
create or replace function join_tournament_by_code(p_code text, p_display_name text default null)
returns participants
language plpgsql security definer set search_path = public as $$
declare v_t tournaments; v_p participants; v_count int; v_name text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_t from tournaments where upper(join_code) = upper(p_code);
  if not found then raise exception 'Code de tournoi inconnu.' using errcode = 'no_data_found'; end if;
  if v_t.status <> 'draft' then
    raise exception 'Les inscriptions sont fermées, le tournoi a déjà démarré.'
      using errcode = 'check_violation';
  end if;

  select * into v_p from participants
    where tournament_id = v_t.id and profile_id = auth.uid();
  if found then return v_p; end if;

  select count(*) into v_count from participants where tournament_id = v_t.id;
  if v_count >= v_t.max_participants then
    raise exception 'Le tournoi est complet (% joueurs).', v_t.max_participants
      using errcode = 'check_violation';
  end if;

  select coalesce(nullif(trim(p_display_name), ''), pr.display_name) into v_name
    from profiles pr where pr.id = auth.uid();

  insert into participants (tournament_id, profile_id, display_name, status, claimed_at)
  values (v_t.id, auth.uid(), v_name, 'active', now())
  returning * into v_p;

  perform log_activity(v_t.id, 'participant_joined', null,
                       jsonb_build_object('participant', v_p.id));
  return v_p;
end $$;

-- 9.3 L'admin ajoute un joueur (sans compte) et récupère son lien
create or replace function add_participant(
  p_tournament uuid, p_display_name text,
  p_phone text default null, p_team_name text default null
) returns participants
language plpgsql security definer set search_path = public as $$
declare v_p participants; v_count int; v_max int;
begin
  if not is_tournament_admin(p_tournament) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;

  select max_participants into v_max from tournaments where id = p_tournament;
  select count(*) into v_count from participants where tournament_id = p_tournament;
  if v_count >= v_max then
    raise exception 'Nombre maximum de participants atteint (%).', v_max
      using errcode = 'check_violation';
  end if;

  insert into participants (tournament_id, display_name, team_name)
  values (p_tournament, trim(p_display_name), nullif(trim(p_team_name), ''))
  returning * into v_p;

  if p_phone is not null then
    insert into participant_contacts (participant_id, phone) values (v_p.id, p_phone);
  end if;

  perform log_activity(p_tournament, 'participant_added', null,
                       jsonb_build_object('participant', v_p.id, 'name', p_display_name));
  return v_p;
end $$;

-- 9.4 Régénérer un lien d'invitation compromis
create or replace function reset_claim_token(p_participant uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tid uuid; v_new uuid;
begin
  select tournament_id into v_tid from participants where id = p_participant;
  if not is_tournament_admin(v_tid) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;
  update participants
    set claim_token = gen_random_uuid(), profile_id = null, claimed_at = null, status = 'invited'
  where id = p_participant
  returning claim_token into v_new;
  return v_new;
end $$;

-- 9.5 Lancer le tournoi
create or replace function generate_schedule(p_tournament uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_t tournaments;
begin
  select * into v_t from tournaments where id = p_tournament;
  if not is_tournament_admin(p_tournament) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;
  if v_t.status <> 'draft' then
    raise exception 'Le calendrier a déjà été généré.' using errcode = 'check_violation';
  end if;

  if v_t.format = 'league' then return fn_generate_league(p_tournament);
  else                            return fn_generate_knockout(p_tournament);
  end if;
end $$;

-- 9.6 Validation d'un match par l'admin
create or replace function validate_match(p_match uuid) returns matches
language plpgsql security definer set search_path = public as $$
declare v_m matches;
begin
  select * into v_m from matches where id = p_match;
  if not is_tournament_admin(v_m.tournament_id) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;
  if v_m.status not in ('reported', 'confirmed') then
    raise exception 'Ce match n''est pas prêt à être validé (statut : %).', v_m.status
      using errcode = 'check_violation';
  end if;
  update matches set status = 'validated' where id = p_match returning * into v_m;
  return v_m;
end $$;

-- 9.7 Validation d'une journée entière
create or replace function validate_round(p_round uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_tid uuid; v_n int;
begin
  select tournament_id into v_tid from rounds where id = p_round;
  if not is_tournament_admin(v_tid) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;

  with upd as (
    update matches set status = 'validated'
    where round_id = p_round and status = 'confirmed'
    returning 1
  ) select count(*) into v_n from upd;

  update rounds set validated_by = auth.uid() where id = p_round;
  perform fn_recompute_round_status(p_round);
  perform log_activity(v_tid, 'round_validated', null,
                       jsonb_build_object('round', p_round, 'matches', v_n));
  return v_n;
end $$;

-- 9.8 Arbitrage d'un litige : l'admin impose le score
create or replace function resolve_dispute(
  p_match uuid, p_home_score int, p_away_score int,
  p_home_pens int default null, p_away_pens int default null,
  p_note text default null
) returns matches
language plpgsql security definer set search_path = public as $$
declare v_m matches;
begin
  select * into v_m from matches where id = p_match;
  if not is_tournament_admin(v_m.tournament_id) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;

  update matches set
    home_score = p_home_score, away_score = p_away_score,
    home_pens = p_home_pens, away_pens = p_away_pens,
    admin_override = true, admin_note = p_note,
    played_at = coalesce(played_at, now()),
    status = 'validated'
  where id = p_match returning * into v_m;

  perform log_activity(v_m.tournament_id, 'dispute_resolved', p_match,
    jsonb_build_object('score', p_home_score || '-' || p_away_score, 'note', p_note));
  return v_m;
end $$;

-- 9.9 Forfait
create or replace function declare_walkover(
  p_match uuid, p_winner uuid, p_goals int default 3
) returns matches
language plpgsql security definer set search_path = public as $$
declare v_m matches;
begin
  select * into v_m from matches where id = p_match;
  if not is_tournament_admin(v_m.tournament_id) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;
  if p_winner not in (v_m.home_id, v_m.away_id) then
    raise exception 'Le vainqueur désigné ne participe pas à ce match.'
      using errcode = 'check_violation';
  end if;

  update matches set
    home_score = case when p_winner = v_m.home_id then p_goals else 0 end,
    away_score = case when p_winner = v_m.away_id then p_goals else 0 end,
    admin_override = true, status = 'walkover', played_at = coalesce(played_at, now())
  where id = p_match returning * into v_m;
  return v_m;
end $$;

-- 9.10 Départage par confrontation directe, pour un groupe d'ex æquo
create or replace function fn_head_to_head(p_tournament uuid, p_ids uuid[])
returns table (participant_id uuid, h2h_points int, h2h_diff int)
language sql stable security definer set search_path = public as $$
  with m as (
    select * from matches
    where tournament_id = p_tournament
      and status in ('validated', 'walkover')
      and home_id = any(p_ids) and away_id = any(p_ids)
      and home_score is not null
  ),
  rows as (
    select home_id as pid, home_score as gf, away_score as ga from m
    union all
    select away_id, away_score, home_score from m
  )
  select r.pid,
         (count(*) filter (where r.gf > r.ga) * t.points_win
        + count(*) filter (where r.gf = r.ga) * t.points_draw)::int,
         (sum(r.gf) - sum(r.ga))::int
  from rows r cross join tournaments t
  where t.id = p_tournament
  group by r.pid, t.points_win, t.points_draw
$$;

-- 9.11 Le tableau de bord d'un joueur : ses prochains matchs, tous tournois
create or replace function my_upcoming_matches()
returns table (
  match_id uuid, tournament_id uuid, tournament_name text,
  round_name text, scheduled_at timestamptz,
  opponent_id uuid, opponent_name text, opponent_phone text,
  is_home boolean, match_status match_status, i_reported boolean
)
language sql stable security definer set search_path = public as $$
  select m.id, t.id, t.name, r.name, m.scheduled_at,
         opp.id, opp.display_name,
         case when can_see_contact(opp.id) then pc.phone end,
         (m.home_id = me.id),
         m.status,
         exists (select 1 from match_reports mr
                 where mr.match_id = m.id and mr.participant_id = me.id)
  from participants me
  join tournaments t on t.id = me.tournament_id and t.status = 'active'
  join matches m on m.tournament_id = t.id and me.id in (m.home_id, m.away_id)
  join rounds r on r.id = m.round_id
  join participants opp
       on opp.id = case when m.home_id = me.id then m.away_id else m.home_id end
  left join participant_contacts pc on pc.participant_id = opp.id
  where me.profile_id = auth.uid()
    and m.status in ('scheduled', 'reported', 'disputed')
  order by m.scheduled_at nulls last, r.ordinal
$$;

-- 9.12 Publication manuelle d'une journée (quand auto_publish_rounds = false)
create or replace function publish_round(p_round uuid) returns rounds
language plpgsql security definer set search_path = public as $$
declare v_r rounds;
begin
  select * into v_r from rounds where id = p_round;
  if not found then raise exception 'Journée introuvable.' using errcode = 'no_data_found'; end if;
  if not is_tournament_admin(v_r.tournament_id) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'Cette journée est déjà publiée.' using errcode = 'check_violation';
  end if;

  update rounds set status = 'open'::round_status where id = p_round returning * into v_r;

  perform fn_notify_tournament(v_r.tournament_id, 'round_published',
    v_r.name || ' est disponible', 'Vos matchs de cette journée sont prêts.',
    '/tournois/' || v_r.tournament_id || '/matchs');
  return v_r;
end $$;

-- 9.13 Retrait d'un participant en cours de tournoi
create or replace function withdraw_participant(p_participant uuid) returns participants
language plpgsql security definer set search_path = public as $$
declare v_p participants; v_t tournaments; m record;
begin
  select * into v_p from participants where id = p_participant;
  if not found then raise exception 'Participant introuvable.' using errcode = 'no_data_found'; end if;
  if not is_tournament_admin(v_p.tournament_id) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;
  if v_p.status = 'withdrawn' then return v_p; end if;
  select * into v_t from tournaments where id = v_p.tournament_id;

  perform fn_engine_on();

  if v_t.format = 'league' then
    if v_t.withdrawal_policy = 'cancel_all' then
      -- ses matchs, joués ou non, sont neutralisés pour tout le monde
      update matches set status = 'cancelled', admin_override = true,
             admin_note = coalesce(admin_note || ' ', '') || '[retrait de ' || v_p.display_name || ']'
        where tournament_id = v_p.tournament_id
          and (home_id = p_participant or away_id = p_participant)
          and status <> 'cancelled';

    elsif v_t.withdrawal_policy = 'keep_forfeit_rest' then
      -- l'acquis reste au classement, le reste passe forfait pour l'adversaire
      for m in
        select id, home_id, away_id from matches
        where tournament_id = v_p.tournament_id
          and (home_id = p_participant or away_id = p_participant)
          and status in ('scheduled', 'reported', 'confirmed', 'disputed')
      loop
        update matches set
          home_score     = case when m.home_id = p_participant then 0 else v_t.walkover_goals end,
          away_score     = case when m.away_id = p_participant then 0 else v_t.walkover_goals end,
          admin_override = true, status = 'walkover',
          played_at      = coalesce(played_at, now())
        where id = m.id;
      end loop;

    else -- 'freeze' : ce qui est joué reste, le reste ne compte pour personne
      update matches set status = 'cancelled'
        where tournament_id = v_p.tournament_id
          and (home_id = p_participant or away_id = p_participant)
          and status in ('scheduled', 'reported', 'confirmed', 'disputed');
    end if;
  end if;
  -- En coupe, on ne touche pas automatiquement au tableau : l'admin tranche
  -- les confrontations en attente au cas par cas avec declare_walkover().

  update participants set status = 'withdrawn', withdrawn_at = now()
    where id = p_participant returning * into v_p;

  perform fn_engine_off();

  perform fn_notify_tournament(v_p.tournament_id, 'participant_withdrawn',
    v_p.display_name || ' a quitté le tournoi', null,
    '/tournois/' || v_p.tournament_id || '/classement', p_participant);
  perform log_activity(v_p.tournament_id, 'participant_withdrawn', null,
    jsonb_build_object('participant', p_participant, 'policy', v_t.withdrawal_policy));

  return v_p;
end $$;

-- 9.14 Phase finale enchaînée après un championnat (deux tournois liés)
create or replace function generate_final_phase(
  p_parent uuid, p_qualifiers int, p_name text default null, p_legs int default 1
) returns tournaments
language plpgsql security definer set search_path = public as $$
declare v_parent tournaments; v_new tournaments; v_count int;
begin
  select * into v_parent from tournaments where id = p_parent;
  if not found then raise exception 'Tournoi introuvable.' using errcode = 'no_data_found'; end if;
  if not is_tournament_admin(p_parent) then
    raise exception 'Réservé aux administrateurs du tournoi.' using errcode = 'insufficient_privilege';
  end if;
  if v_parent.format <> 'league' then
    raise exception 'La phase finale part obligatoirement d''un championnat.'
      using errcode = 'check_violation';
  end if;
  if v_parent.status <> 'completed' then
    raise exception 'Le championnat doit être terminé avant de générer la phase finale.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from tournaments where parent_tournament_id = p_parent) then
    raise exception 'Une phase finale existe déjà pour ce championnat.'
      using errcode = 'unique_violation';
  end if;

  select count(*) into v_count from participants
    where tournament_id = p_parent and status <> 'withdrawn';
  if p_qualifiers > v_count then
    raise exception 'Seuls % joueurs sont classés, impossible d''en qualifier %.', v_count, p_qualifiers
      using errcode = 'check_violation';
  end if;

  insert into tournaments (
    name, format, legs, created_by, max_participants, parent_tournament_id,
    qualifiers_count, require_screenshot, auto_validate, allow_self_report,
    contacts_visibility, third_place_match, is_public, default_venue
  ) values (
    coalesce(p_name, v_parent.name || ' — Phase finale'), 'knockout', p_legs,
    v_parent.created_by, p_qualifiers, p_parent, p_qualifiers,
    v_parent.require_screenshot, v_parent.auto_validate, v_parent.allow_self_report,
    v_parent.contacts_visibility, true, v_parent.is_public, v_parent.default_venue
  ) returning * into v_new;

  -- reprend les N premiers du classement, tête de série = position finale
  insert into participants (tournament_id, profile_id, display_name, team_name, seed)
  select v_new.id, p.profile_id, p.display_name, p.team_name, s.position
  from standings s
  join participants p on p.id = s.participant_id
  where s.tournament_id = p_parent
  order by s.position
  limit p_qualifiers;

  insert into participant_contacts (participant_id, phone, whatsapp)
  select np.id, pc.phone, pc.whatsapp
  from participants np
  join standings s on s.tournament_id = p_parent and s.position = np.seed
  join participant_contacts pc on pc.participant_id = s.participant_id
  where np.tournament_id = v_new.id;

  perform fn_notify_tournament(p_parent, 'final_phase_ready',
    'La phase finale est prête',
    'Les ' || p_qualifiers || ' qualifiés peuvent voir leur tableau.',
    '/tournois/' || v_new.id);

  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- 10. DROITS D'EXÉCUTION
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on all functions in schema public to authenticated';
    execute 'grant execute on function claim_participant(uuid), join_tournament_by_code(text, text) to anon';
    -- les fonctions internes ne sont pas appelables directement
    execute 'revoke execute on function
               fn_engine_on(), fn_engine_off(), fn_generate_league(uuid), fn_generate_knockout(uuid),
               fn_settle_tie(uuid), fn_place_in_tie(uuid, char, uuid), fn_materialize_tie(uuid),
               fn_settle_bye(uuid), fn_recompute_round_status(uuid), fn_publish_next_round(uuid, int),
               fn_notify(uuid, uuid, notification_kind, text, text, text),
               fn_notify_tournament(uuid, notification_kind, text, text, text, uuid),
               fn_notify_admins(uuid, notification_kind, text, text, text),
               log_activity(uuid, text, uuid, jsonb)
             from authenticated, anon';
  end if;
end $$;
