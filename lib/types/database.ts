// Types correspondant au schéma SQL (supabase/migrations/01_schema.sql).
// À remplacer par `supabase gen types typescript` une fois le projet lié ;
// en attendant, ce fichier reste la source de vérité manuelle.

export type TournamentFormat = 'league' | 'knockout';
export type TournamentStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ParticipantStatus = 'invited' | 'active' | 'withdrawn';
export type RoundStatus = 'pending' | 'open' | 'awaiting_validation' | 'validated';
export type MatchStatus =
  | 'scheduled' | 'reported' | 'confirmed' | 'disputed'
  | 'validated' | 'walkover' | 'cancelled';
export type TieStatus = 'pending' | 'in_progress' | 'completed';
export type ContactVisibility = 'opponent_only' | 'all_participants' | 'hidden';
export type WithdrawalPolicy = 'cancel_all' | 'keep_forfeit_rest' | 'freeze';
export type NotificationKind =
  | 'match_reported' | 'score_disputed' | 'match_validated' | 'round_published'
  | 'next_match_ready' | 'tournament_completed' | 'participant_withdrawn' | 'final_phase_ready';

export interface Profile {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  format: TournamentFormat;
  legs: 1 | 2;
  single_leg_final: boolean;
  status: TournamentStatus;
  created_by: string;
  max_participants: number;
  is_public: boolean;
  join_code: string | null;
  points_win: number;
  points_draw: number;
  points_loss: number;
  tiebreakers: string[];
  away_goals_rule: boolean;
  third_place_match: boolean;
  require_screenshot: boolean;
  auto_validate: boolean;
  allow_self_report: boolean;
  report_deadline_h: number;
  contacts_visibility: ContactVisibility;
  withdrawal_policy: WithdrawalPolicy;
  walkover_goals: number;
  default_venue: string | null;
  auto_publish_rounds: boolean;
  parent_tournament_id: string | null;
  qualifiers_count: number | null;
  starts_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  tournament_id: string;
  profile_id: string | null;
  display_name: string;
  team_name: string | null;
  seed: number | null;
  status: ParticipantStatus;
  claim_token: string;
  claimed_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
}

export interface ParticipantContact {
  participant_id: string;
  phone: string | null;
  whatsapp: string | null;
  updated_at: string;
}

export interface Round {
  id: string;
  tournament_id: string;
  ordinal: number;
  name: string;
  leg: 1 | 2;
  stage: string | null;
  status: RoundStatus;
  scheduled_on: string | null;
  deadline: string | null;
  validated_at: string | null;
  validated_by: string | null;
}

export interface Tie {
  id: string;
  tournament_id: string;
  stage: string;
  position: number;
  participant_a: string | null;
  participant_b: string | null;
  winner_id: string | null;
  loser_id: string | null;
  next_tie_id: string | null;
  next_slot: 'a' | 'b' | null;
  status: TieStatus;
}

export interface Match {
  id: string;
  tournament_id: string;
  round_id: string;
  tie_id: string | null;
  leg: 1 | 2;
  position: number;
  home_id: string | null;
  away_id: string | null;
  home_score: number | null;
  away_score: number | null;
  home_pens: number | null;
  away_pens: number | null;
  status: MatchStatus;
  winner_id: string | null;
  admin_override: boolean;
  admin_note: string | null;
  venue: string | null;
  scheduled_at: string | null;
  played_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
  created_at: string;
}

export interface MatchReport {
  id: string;
  match_id: string;
  participant_id: string;
  reported_by: string | null;
  home_score: number;
  away_score: number;
  home_pens: number | null;
  away_pens: number | null;
  screenshot_path: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  profile_id: string;
  tournament_id: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface StandingRow {
  tournament_id: string;
  participant_id: string;
  display_name: string;
  team_name: string | null;
  participant_status: ParticipantStatus;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  position: number;
}

export interface UpcomingMatchRow {
  match_id: string;
  tournament_id: string;
  tournament_name: string;
  round_name: string;
  scheduled_at: string | null;
  opponent_id: string;
  opponent_name: string;
  opponent_phone: string | null;
  is_home: boolean;
  match_status: MatchStatus;
  i_reported: boolean;
}

// Vue enrichie construite côté client (match + noms + tournoi), utilisée par
// les écrans de tournoi (pas une vue SQL, un assemblage de requêtes jointes).
export interface MatchWithNames extends Match {
  home_name: string | null;
  away_name: string | null;
  round_name: string;
  round_ordinal: number;
}