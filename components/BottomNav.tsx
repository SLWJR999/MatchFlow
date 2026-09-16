"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Accueil", icon: HomeIcon },
  { href: "/tournois", label: "Tournois", icon: TrophyIcon },
  { href: "/matchs", label: "Matchs", icon: BallIcon },
  { href: "/profil", label: "Profil", icon: UserIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  // Pas de nav sur les pages publiques / d'authentification : elles ont
  // leur propre parcours, souvent sans compte.
  if (
    pathname.startsWith("/t/") ||
    pathname.startsWith("/rejoindre") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth")
  ) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-1 py-2.5 text-xs"
                aria-current={active ? "page" : undefined}
              >
                <Icon active={active} />
                <span className={active ? "text-pitch-700 font-medium" : "text-ink-600"}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function iconColor(active?: boolean) {
  return active ? "var(--pitch-700)" : "var(--ink-600)";
}

function HomeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconColor(active)} strokeWidth="1.8">
      <path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconColor(active)} strokeWidth="1.8">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 13v3m-3 4h6m-6 0 1-4h4l1 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BallIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconColor(active)} strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.5 15.5 11l-1.3 4h-4.4L8.5 11 12 8.5Zm0-4.5v2m8 4-1.8 1M4 9.5l1.8 1M8 20l.9-1.9m6.2 0 .9 1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconColor(active)} strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}