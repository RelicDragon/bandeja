import type { BracketScope } from '@/api/leagues';

export type LeagueBracketScheduleDeepLinkParams = {
  roundId?: string | null;
  groupId?: string | null;
  bracketScope?: BracketScope | null;
};

/** Canonical schedule-tab bracket query (`tab=schedule&subtab=bracket&…`). */
export function buildLeagueBracketScheduleSearch(
  params: LeagueBracketScheduleDeepLinkParams
): string {
  const sp = new URLSearchParams();
  sp.set('tab', 'schedule');
  sp.set('subtab', 'bracket');
  const roundId = params.roundId?.trim();
  if (roundId) {
    sp.set('roundId', roundId);
    sp.set('round', roundId);
  }
  const scope = params.bracketScope ?? 'PER_GROUP';
  const groupId = params.groupId?.trim();
  if (scope === 'PER_GROUP' && groupId) {
    sp.set('group', groupId);
  }
  return sp.toString();
}

export function buildLeagueBracketSchedulePath(
  leagueSeasonId: string,
  params: LeagueBracketScheduleDeepLinkParams
): string {
  return `/games/${leagueSeasonId}?${buildLeagueBracketScheduleSearch(params)}`;
}

export function parseLeagueBracketScheduleSearch(search: string): {
  roundId: string | null;
  groupId: string | null;
} {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const roundId = sp.get('roundId')?.trim() || sp.get('round')?.trim() || null;
  const groupId = sp.get('group')?.trim() || null;
  return { roundId, groupId };
}
