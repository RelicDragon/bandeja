import type { PerformanceRelationshipEntry, PerformanceRelationshipGame } from '@/api/users';

export function getPlayerName(entry: PerformanceRelationshipEntry, fallback: string) {
  const name = `${entry.user.firstName ?? ''} ${entry.user.lastName ?? ''}`.trim();
  return name || fallback;
}

export function getPlayerNameLines(entry: PerformanceRelationshipEntry, fallback: string) {
  const firstName = entry.user.firstName?.trim();
  const lastName = entry.user.lastName?.trim();

  if (firstName && lastName) return [firstName, lastName];

  const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return [name || fallback];
}

export function getInitials(entry: PerformanceRelationshipEntry) {
  const initials = `${entry.user.firstName?.[0] ?? ''}${entry.user.lastName?.[0] ?? ''}`.toUpperCase();
  return initials || '?';
}

export function formatRatingNetChange(change: number) {
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}`;
}

export function getRatingNetChangeClass(change: number) {
  if (change > 0) {
    return 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/60';
  }
  if (change < 0) {
    return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/60';
  }
  return 'bg-gray-50 text-gray-600 ring-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:ring-gray-700';
}

export function getGameLocation(game: PerformanceRelationshipGame) {
  const parts = [game.court?.name, game.club?.name].filter(Boolean);
  return [...new Set(parts)].join(' · ');
}
