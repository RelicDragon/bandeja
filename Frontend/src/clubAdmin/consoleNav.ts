/**
 * Console navigation model: sections, the capability each needs, club sub-pages and the path
 * helpers. Pure — the shell, route guards and tests all read from here.
 */
import type { ClubAdminCapability } from '@shared/clubAdmin/contract';

export type ConsoleSectionId = 'today' | 'schedule' | 'bookings' | 'reports' | 'club';

export interface ConsoleSection {
  id: ConsoleSectionId;
  /** Path below `/my-clubs/:clubId`. */
  path: string;
  /** Any one of these grants the section; empty = always visible. */
  anyOf: readonly ClubAdminCapability[];
}

/** Capabilities that make the Club area worth showing (any of its rows). */
export const CLUB_AREA_CAPABILITIES: readonly ClubAdminCapability[] = [
  'club.edit',
  'courts.edit',
  'billing.configure',
  'team.manage',
  'activity.view',
  'reviews.view',
];

export const CONSOLE_SECTIONS: readonly ConsoleSection[] = [
  { id: 'today', path: '', anyOf: [] },
  { id: 'schedule', path: 'schedule', anyOf: ['schedule.view'] },
  { id: 'bookings', path: 'bookings', anyOf: ['bookings.view'] },
  { id: 'reports', path: 'reports', anyOf: ['reports.view'] },
  { id: 'club', path: 'club', anyOf: CLUB_AREA_CAPABILITIES },
];

export type ClubPageId = 'profile' | 'hours' | 'courts' | 'pricing' | 'team' | 'activity' | 'reviews';

export interface ClubPageEntry {
  id: ClubPageId;
  capability: ClubAdminCapability;
  /**
   * Has a screen today. Team, activity and reviews have endpoints in the contract but no screen
   * yet; they stay out of the hub until one ships rather than showing a dead row.
   */
  available: boolean;
}

export const CLUB_PAGES: readonly ClubPageEntry[] = [
  { id: 'profile', capability: 'club.edit', available: true },
  { id: 'hours', capability: 'club.edit', available: true },
  { id: 'courts', capability: 'courts.edit', available: true },
  { id: 'pricing', capability: 'billing.configure', available: true },
  { id: 'team', capability: 'team.manage', available: false },
  { id: 'activity', capability: 'activity.view', available: false },
  { id: 'reviews', capability: 'reviews.view', available: false },
];

export function hasAny(capabilities: readonly ClubAdminCapability[], anyOf: readonly ClubAdminCapability[]): boolean {
  return anyOf.length === 0 || anyOf.some((c) => capabilities.includes(c));
}

export function visibleSections(capabilities: readonly ClubAdminCapability[]): ConsoleSection[] {
  return CONSOLE_SECTIONS.filter((s) => hasAny(capabilities, s.anyOf));
}

export function visibleClubPages(capabilities: readonly ClubAdminCapability[]): ClubPageEntry[] {
  return CLUB_PAGES.filter((p) => p.available && capabilities.includes(p.capability));
}

export function consoleBase(clubId: string): string {
  return `/my-clubs/${encodeURIComponent(clubId)}`;
}

export function sectionPath(clubId: string, section: ConsoleSectionId): string {
  const s = CONSOLE_SECTIONS.find((x) => x.id === section);
  return s && s.path ? `${consoleBase(clubId)}/${s.path}` : consoleBase(clubId);
}

/** Payments ledger (`billing.collect`); lives under the Bookings section. */
export function paymentsPath(clubId: string): string {
  return `${consoleBase(clubId)}/payments`;
}

/** Path segments after `/my-clubs/:clubId`. */
export function consoleSubPath(pathname: string): string[] {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === 'my-clubs' ? parts.slice(2) : [];
}

export function sectionFromPath(pathname: string): ConsoleSectionId {
  const first = consoleSubPath(pathname)[0] ?? '';
  if (first === 'reservations' || first === 'payments') return 'bookings';
  if (first === 'courts' || first === 'settings') return 'club';
  const hit = CONSOLE_SECTIONS.find((s) => s.path === first);
  return hit ? hit.id : 'today';
}

/** 0 = a section root, 1+ = drilled into it (shows a back button). */
export function consoleDepth(pathname: string): number {
  return Math.max(0, consoleSubPath(pathname).length - 1);
}

/** Same section in another club (club switcher keeps the operator where they were). */
export function switchClubPath(pathname: string, nextClubId: string): string {
  return sectionPath(nextClubId, sectionFromPath(pathname));
}
