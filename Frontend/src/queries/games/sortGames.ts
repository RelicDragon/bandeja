import type { Game } from '@/types';

/** Past / history lists: newest first. */
export function sortGames(games: Game[]): Game[] {
  return [...games].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );
}

/** Upcoming / find / calendar day lists: earliest first. */
export function sortGamesByStartTimeAsc(games: Game[]): Game[] {
  return [...games].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

const ACTIVE_STATUSES = new Set(['ANNOUNCED', 'STARTED']);

/** Active games earliest-first; finished/archived last (newest finished first). */
export function sortGamesByStatusAndStartTime<T extends { status?: string; startTime: string }>(
  list: T[] = [],
): T[] {
  const getStatusPriority = (status?: string): number => {
    if (status && ACTIVE_STATUSES.has(status)) return 0;
    if (status === 'FINISHED') return 1;
    if (status === 'ARCHIVED') return 2;
    return 3;
  };

  return [...list].sort((a, b) => {
    const statusPriorityA = getStatusPriority(a.status);
    const statusPriorityB = getStatusPriority(b.status);

    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB;
    }

    const dateTimeA = new Date(a.startTime).getTime();
    const dateTimeB = new Date(b.startTime).getTime();

    if (statusPriorityA === 0) {
      return dateTimeA - dateTimeB;
    }

    return dateTimeB - dateTimeA;
  });
}
