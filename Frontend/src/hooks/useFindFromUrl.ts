import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * PRD 354 — `?clubIds=a,b` applies the Find club filter.
 *
 * Parsed here rather than at the call site so the "See all on Find" link from
 * the club page and any future deep link share one definition of the param.
 */
export function parseFindClubIdsParam(raw: string | null): string[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

export function useFindFromUrl() {
  const [searchParams] = useSearchParams();
  const view = (searchParams.get('view') || 'calendar') as 'calendar' | 'list';
  const date = searchParams.get('date') || undefined;
  const week = searchParams.get('week') || undefined;
  const game = searchParams.get('game') === '1';
  const training = searchParams.get('training') === '1';
  const tournament = searchParams.get('tournament') === '1';
  const leagues = searchParams.get('leagues') === '1';
  const clubIdsParam = searchParams.get('clubIds');
  // Memoised on the raw string: a fresh array each render would re-fire every
  // effect that depends on it.
  const clubIds = useMemo(() => parseFindClubIdsParam(clubIdsParam), [clubIdsParam]);

  return { view, date, week, game, training, tournament, leagues, clubIds };
}
