-- =====================================================================
--  TOURNOIS FOOT — 03 · SÉCURITÉ (RLS)
-- =====================================================================

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant usage on schema public to anon, authenticated';
    execute 'grant select on all tables in schema public to anon, authenticated';
    execute 'grant insert, update, delete on
               participants, participant_contacts, match_reports,
               matches, tournaments, tournament_admins, rounds, ties,
               profiles, push_subscriptions, notifications
             to authenticated';
    execute 'grant usage, select on all sequences in schema public to authenticated';
  end if;
end $$;

create or replace function fn_guard_participant_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_tournament_admin(new.tournament_id) or fn_engine_is_on() then
    return new;
  end if;
  if new.profile_id  is distinct from old.profile_id
  or new.tournament_id is distinct from old.tournament_id
  or new.status      is distinct from old.status
  or new.seed        is distinct from old.seed
  or new.claim_token is distinct from old.claim_token then
    raise exception 'Vous ne pouvez modifier que votre nom et votre équipe.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_participant on participants;
create trigger trg_guard_participant before update on participants
  for each row execute function fn_guard_participant_update();

create or replace function can_see_report(p_match uuid, p_participant uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    where m.id = p_match
      and (
        is_tournament_admin(m.tournament_id)
        or p_participant = my_participant_id(m.tournament_id)
        or m.status in ('confirmed', 'validated', 'disputed', 'walkover')
        or exists (
          select 1 from match_reports mine
          where mine.match_id = p_match
            and mine.participant_id = my_participant_id(m.tournament_id)
        )
      )
  )
$$;

alter table profiles             enable row level security;
alter table tournaments          enable row level security;
alter table tournament_admins    enable row level security;
alter table participants         enable row level security;
alter table participant_contacts enable row level security;
alter table rounds               enable row level security;
alter table ties                 enable row level security;
alter table matches              enable row level security;
alter table match_reports        enable row level security;
alter table activity_log         enable row level security;
alter table notifications        enable row level security;
alter table push_subscriptions   enable row level security;

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

drop policy if exists tournaments_select on tournaments;
create policy tournaments_select on tournaments
  for select using (is_public or is_participant(id) or is_tournament_admin(id));

drop policy if exists tournaments_insert on tournaments;
create policy tournaments_insert on tournaments
  for insert with check (is_real_user() and created_by = auth.uid());

drop policy if exists tournaments_update on tournaments;
create policy tournaments_update on tournaments
  for update using (is_tournament_admin(id)) with check (is_tournament_admin(id));

drop policy if exists tournaments_delete on tournaments;
create policy tournaments_delete on tournaments
  for delete using (created_by = auth.uid() and status = 'draft');

drop policy if exists admins_select on tournament_admins;
create policy admins_select on tournament_admins
  for select using (can_see_tournament(tournament_id));

drop policy if exists admins_write on tournament_admins;
create policy admins_write on tournament_admins
  for all using (is_tournament_admin(tournament_id))
  with check (is_tournament_admin(tournament_id));

drop policy if exists participants_select on participants;
create policy participants_select on participants
  for select using (can_see_tournament(tournament_id));

drop policy if exists participants_insert on participants;
create policy participants_insert on participants
  for insert with check (is_tournament_admin(tournament_id));

drop policy if exists participants_update on participants;
create policy participants_update on participants
  for update using (is_tournament_admin(tournament_id) or profile_id = auth.uid());

drop policy if exists participants_delete on participants;
create policy participants_delete on participants
  for delete using (
    is_tournament_admin(tournament_id)
    and exists (select 1 from tournaments t
                where t.id = tournament_id and t.status = 'draft')
  );

drop policy if exists contacts_select on participant_contacts;
create policy contacts_select on participant_contacts
  for select using (can_see_contact(participant_id));

drop policy if exists contacts_write on participant_contacts;
create policy contacts_write on participant_contacts
  for all using (
    exists (select 1 from participants p
            where p.id = participant_id
              and (p.profile_id = auth.uid() or is_tournament_admin(p.tournament_id)))
  ) with check (
    exists (select 1 from participants p
            where p.id = participant_id
              and (p.profile_id = auth.uid() or is_tournament_admin(p.tournament_id)))
  );

drop policy if exists rounds_select on rounds;
create policy rounds_select on rounds
  for select using (can_see_tournament(tournament_id));

drop policy if exists rounds_write on rounds;
create policy rounds_write on rounds
  for all using (is_tournament_admin(tournament_id))
  with check (is_tournament_admin(tournament_id));

drop policy if exists ties_select on ties;
create policy ties_select on ties
  for select using (can_see_tournament(tournament_id));

drop policy if exists ties_write on ties;
create policy ties_write on ties
  for all using (is_tournament_admin(tournament_id))
  with check (is_tournament_admin(tournament_id));

drop policy if exists matches_select on matches;
create policy matches_select on matches
  for select using (can_see_tournament(tournament_id));

drop policy if exists matches_write on matches;
create policy matches_write on matches
  for all using (is_tournament_admin(tournament_id))
  with check (is_tournament_admin(tournament_id));

drop policy if exists reports_select on match_reports;
create policy reports_select on match_reports
  for select using (can_see_report(match_id, participant_id));

drop policy if exists reports_insert on match_reports;
create policy reports_insert on match_reports
  for insert with check (can_report_match(match_id));

drop policy if exists reports_update on match_reports;
create policy reports_update on match_reports
  for update using (can_report_match(match_id))
  with check (can_report_match(match_id));

drop policy if exists reports_delete on match_reports;
create policy reports_delete on match_reports
  for delete using (
    exists (select 1 from matches m where m.id = match_id
              and is_tournament_admin(m.tournament_id))
  );

drop policy if exists activity_select on activity_log;
create policy activity_select on activity_log
  for select using (can_see_tournament(tournament_id));

drop policy if exists notifications_own on notifications;
create policy notifications_own on notifications
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists push_own on push_subscriptions;
create policy push_own on push_subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

do $$ begin
  if to_regprocedure('storage.foldername(text)') is null then
    raise notice 'Schéma storage absent : section ignorée (normal en local).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('screenshots', 'screenshots', false, 2097152,
          array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    drop policy if exists screenshots_read on storage.objects;
    create policy screenshots_read on storage.objects for select
      using (
        bucket_id = 'screenshots'
        and can_see_tournament(((storage.foldername(name))[1])::uuid)
      );

    drop policy if exists screenshots_write on storage.objects;
    create policy screenshots_write on storage.objects for insert
      with check (
        bucket_id = 'screenshots'
        and can_report_match(((storage.foldername(name))[2])::uuid)
      );

    drop policy if exists screenshots_update on storage.objects;
    create policy screenshots_update on storage.objects for update
      using (bucket_id = 'screenshots' and owner = auth.uid());

    drop policy if exists screenshots_delete on storage.objects;
    create policy screenshots_delete on storage.objects for delete
      using (
        bucket_id = 'screenshots'
        and (owner = auth.uid()
             or is_tournament_admin(((storage.foldername(name))[1])::uuid))
      );
  $p$;
end $$;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : section ignorée.';
    return;
  end if;
  foreach t in array array['matches', 'match_reports', 'rounds', 'ties', 'participants'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;