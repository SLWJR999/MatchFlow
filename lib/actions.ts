"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

// ---------------------------------------------------------------- AUTH
export async function sendMagicLink(email: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { error: error.message };
  if (data.url) redirect(data.url);
}

export async function signInAnonymously() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInAnonymously();
  if (error) return { error: error.message };
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateMyProfile(displayName: string, phone: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, phone })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/profil");
  return { ok: true };
}

// Convertit un compte anonyme (arrivé par lien d'invitation) en compte
// complet, sans rien perdre de sa participation aux tournois : Supabase
// rattache l'email à la MÊME session, l'id utilisateur ne change pas.
export async function linkEmailToAccount(email: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl()}/auth/callback` },
  );
  if (error) return { error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------- TOURNOIS
export async function createTournament(input: {
  name: string; format: "league" | "knockout"; legs: 1 | 2;
  max_participants: number; require_screenshot: boolean;
  allow_self_report: boolean; third_place_match: boolean;
  contacts_visibility: "opponent_only" | "all_participants" | "hidden";
  auto_validate?: boolean; auto_publish_rounds?: boolean;
  default_venue?: string | null; walkover_goals?: number;
  report_deadline_h?: number; is_public?: boolean;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Connexion requise." };

  const { data, error } = await supabase
    .from("tournaments")
    .insert({ ...input, created_by: user.id })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/tournois");
  return { ok: true, tournament: data };
}

export async function generateSchedule(tournamentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_schedule", { p_tournament: tournamentId });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${tournamentId}`);
  return { ok: true };
}

export async function addParticipant(
  tournamentId: string, displayName: string, phone?: string, teamName?: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_participant", {
    p_tournament: tournamentId, p_display_name: displayName,
    p_phone: phone || null, p_team_name: teamName || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${tournamentId}/participants`);
  return { ok: true, participant: data };
}

export async function resetClaimToken(participantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_claim_token", { p_participant: participantId });
  if (error) return { error: error.message };
  return { ok: true, token: data as string };
}

export async function withdrawParticipant(participantId: string, tournamentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_participant", { p_participant: participantId });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${tournamentId}/participants`);
  revalidatePath(`/tournois/${tournamentId}`);
  return { ok: true };
}

export async function claimByToken(token: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // On connecte la personne anonymement pour qu'elle puisse jouer
    // tout de suite, sans mot de passe.
    const { error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr) return { error: anonErr.message };
  }
  const { data, error } = await supabase.rpc("claim_participant", { p_token: token });
  if (error) return { error: error.message };
  return { ok: true, participant: data };
}

export async function joinByCode(code: string, displayName?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_tournament_by_code", {
    p_code: code, p_display_name: displayName || null,
  });
  if (error) return { error: error.message };
  return { ok: true, participant: data };
}

export async function generateFinalPhase(parentId: string, qualifiers: number, name?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_final_phase", {
    p_parent: parentId, p_qualifiers: qualifiers, p_name: name || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${parentId}`);
  return { ok: true, tournament: data };
}

// ---------------------------------------------------------------- SCORES
export async function submitReport(input: {
  matchId: string; participantId: string;
  homeScore: number; awayScore: number;
  homePens?: number | null; awayPens?: number | null;
  screenshotPath?: string | null; note?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Connexion requise." };

  const { error } = await supabase.from("match_reports").upsert(
    {
      match_id: input.matchId,
      participant_id: input.participantId,
      reported_by: user.id,
      home_score: input.homeScore,
      away_score: input.awayScore,
      home_pens: input.homePens ?? null,
      away_pens: input.awayPens ?? null,
      screenshot_path: input.screenshotPath ?? null,
      note: input.note ?? null,
    },
    { onConflict: "match_id,participant_id" },
  );
  if (error) return { error: error.message };
  revalidatePath(`/matchs/${input.matchId}`);
  return { ok: true };
}

export async function uploadScreenshot(matchId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Connexion requise." };
  const file = formData.get("file") as File | null;
  if (!file) return { error: "Aucun fichier." };

  const match = await supabase.from("matches").select("tournament_id").eq("id", matchId).single();
  if (!match.data) return { error: "Match introuvable." };

  const path = `${match.data.tournament_id}/${matchId}/${user.id}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("screenshots").upload(path, file, {
    contentType: file.type || "image/jpeg", upsert: true,
  });
  if (error) return { error: error.message };
  return { ok: true, path };
}

export async function validateMatch(matchId: string, tournamentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("validate_match", { p_match: matchId });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${tournamentId}/admin`);
  return { ok: true };
}

export async function validateRound(roundId: string, tournamentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("validate_round", { p_round: roundId });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${tournamentId}/admin`);
  return { ok: true };
}

export async function publishRound(roundId: string, tournamentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_round", { p_round: roundId });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${tournamentId}/matchs`);
  return { ok: true };
}

export async function resolveDispute(input: {
  matchId: string; tournamentId: string;
  homeScore: number; awayScore: number;
  homePens?: number | null; awayPens?: number | null; note?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_dispute", {
    p_match: input.matchId, p_home_score: input.homeScore, p_away_score: input.awayScore,
    p_home_pens: input.homePens ?? null, p_away_pens: input.awayPens ?? null,
    p_note: input.note ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${input.tournamentId}/admin`);
  revalidatePath(`/matchs/${input.matchId}`);
  return { ok: true };
}

export async function declareWalkover(matchId: string, tournamentId: string, winnerId: string, goals = 3) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("declare_walkover", {
    p_match: matchId, p_winner: winnerId, p_goals: goals,
  });
  if (error) return { error: error.message };
  revalidatePath(`/tournois/${tournamentId}/admin`);
  return { ok: true };
}

// ---------------------------------------------------------------- PUSH
export async function savePushSubscription(sub: PushSubscriptionJSON, userAgent: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !sub.endpoint || !sub.keys) return { error: "Non connecté." };
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id, endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh, auth_key: sub.keys.auth, user_agent: userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: error.message };
  return { ok: true };
}