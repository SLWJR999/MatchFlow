import type { MatchStatus, RoundStatus, TournamentFormat } from "@/lib/types/database";

export function formatDate(iso: string | null): string {
  if (!iso) return "Date à définir";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(iso));
}

export const matchStatusLabel: Record<MatchStatus, string> = {
  scheduled: "À jouer",
  reported: "En attente de l'adversaire",
  confirmed: "En attente de validation",
  disputed: "Litige à trancher",
  validated: "Résultat officiel",
  walkover: "Forfait",
  cancelled: "Annulé",
};

export const matchStatusTone: Record<MatchStatus, "neutral" | "gold" | "brick" | "pitch"> = {
  scheduled: "neutral",
  reported: "gold",
  confirmed: "gold",
  disputed: "brick",
  validated: "pitch",
  walkover: "pitch",
  cancelled: "neutral",
};

export const roundStatusLabel: Record<RoundStatus, string> = {
  pending: "Pas encore publiée",
  open: "En cours",
  awaiting_validation: "À valider",
  validated: "Terminée",
};

export function formatName(displayName: string): string {
  return displayName;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatLabel(format: TournamentFormat): string {
  return format === "league" ? "Championnat" : "Élimination directe";
}

export function waLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}`;
}

export function telLink(phone: string | null): string | null {
  if (!phone) return null;
  return `tel:${phone.replace(/\s+/g, "")}`;
}

export function scoreLine(home: number | null, away: number | null): string {
  if (home === null || away === null) return "— : —";
  return `${home} : ${away}`;
}