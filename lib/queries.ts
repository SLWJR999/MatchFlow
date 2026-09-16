import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Tournament, Participant, StandingRow, UpcomingMatchRow,
  MatchWithNames, Notification, Round, Tie,
} from "@/lib/types/database";

// L'utilisateur courant (compte complet ou anonyme via un lien
// d'invitation) et son profil applicatif. Renvoie null si personne
// n'est connecté — les pages appelantes gèrent la redirection.
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).maybeSingle();

  return { user, profile };
}

// Tournois où je suis participant ou administrateur, avec ma ligne
// de classement quand c'est un championnat.
export async function getMyTournaments() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: myParticipations } = await supabase
    .from("participants")
    .select("tournament_id, tournaments(*)")
    .eq("profile_id", user.id)
    .neq("status", "withdrawn");

  const tournaments = (myParticipations ?? [])
    .map((p: any) => p.tournaments as Tournament)
    .filter(Boolean);

  // dédoublonner (un même profil ne devrait avoir qu'une place par tournoi,
  // mais on protège contre les jointures multiples)
  const byId = new Map(tournaments.map((t) => [t.id, t]));
  return Array.from(byId.values()).sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
  );
}

export async function getMyStandingRow(tournamentId: string): Promise<StandingRow | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("standings")
    .select("*, participants!inner(profile_id)")
    .eq("tournament_id", tournamentId)
    .eq("participants.profile_id", user.id)
    .maybeSingle();

  return (data as unknown as StandingRow) ?? null;
}

export async function getUpcomingMatches(): Promise<UpcomingMatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_upcoming_matches");
  if (error) {
    console.error(error);
    return [];
  }
  return (data ?? []) as UpcomingMatchRow[];
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
  return data as Tournament | null;
}

export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("*").eq("slug", slug).maybeSingle();
  return data as Tournament | null;
}

export async function isTournamentAdmin(tournamentId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_tournament_admin", { p_tournament: tournamentId });
  return Boolean(data);
}

export async function getMyParticipant(tournamentId: string): Promise<Participant | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("participants").select("*")
    .eq("tournament_id", tournamentId).eq("profile_id", user.id).maybeSingle();
  return data as Participant | null;
}

export async function getStandings(tournamentId: string): Promise<StandingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("standings").select("*")
    .eq("tournament_id", tournamentId).order("position");
  return (data ?? []) as StandingRow[];
}

export async function getParticipants(tournamentId: string): Promise<Participant[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("participants").select("*")
    .eq("tournament_id", tournamentId)
    .order("seed", { ascending: true, nullsFirst: false })
    .order("display_name");
  return (data ?? []) as Participant[];
}

export async function getRounds(tournamentId: string): Promise<Round[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rounds").select("*").eq("tournament_id", tournamentId).order("ordinal");
  return (data ?? []) as Round[];
}

export async function getTies(tournamentId: string): Promise<Tie[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ties").select("*").eq("tournament_id", tournamentId);
  return (data ?? []) as Tie[];
}

// Confrontations avec leurs matchs imbriqués, pour la vue en tableau.
export async function getTiesWithMatches(tournamentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ties")
    .select("*, matches(id, home_score, away_score, status, leg)")
    .eq("tournament_id", tournamentId);
  return data ?? [];
}

export async function getMatchesWithNames(tournamentId: string): Promise<MatchWithNames[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("*, home:participants!matches_home_id_fkey(display_name), away:participants!matches_away_id_fkey(display_name), rounds(name, ordinal)")
    .eq("tournament_id", tournamentId)
    .order("created_at");

  return (data ?? []).map((m: any) => ({
    ...m,
    home_name: m.home?.display_name ?? null,
    away_name: m.away?.display_name ?? null,
    round_name: m.rounds?.name ?? "",
    round_ordinal: m.rounds?.ordinal ?? 0,
  }));
}

export async function getMatch(matchId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select(`
      *,
      home:participants!matches_home_id_fkey(id, display_name, profile_id),
      away:participants!matches_away_id_fkey(id, display_name, profile_id),
      rounds(name),
      tournaments(*)
    `)
    .eq("id", matchId)
    .maybeSingle();
  return data as any;
}

export async function getMatchReports(matchId: string): Promise<any[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("match_reports").select("*").eq("match_id", matchId);
  return data ?? [];
}

export async function getContact(participantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("participant_contacts").select("*").eq("participant_id", participantId).maybeSingle();
  return data;
}

export async function getPendingValidations(tournamentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select(`
      *,
      home:participants!matches_home_id_fkey(display_name),
      away:participants!matches_away_id_fkey(display_name),
      rounds(name),
      match_reports(participant_id, home_score, away_score, screenshot_path)
    `)
    .eq("tournament_id", tournamentId)
    .in("status", ["reported", "confirmed", "disputed"])
    .order("created_at");
  return data ?? [];
}

export async function getMyNotifications(limit = 30): Promise<Notification[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("notifications").select("*")
    .eq("profile_id", user.id).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as Notification[];
}

export async function getFinalPhase(parentId: string): Promise<Tournament | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournaments").select("*").eq("parent_tournament_id", parentId).maybeSingle();
  return data as Tournament | null;
}