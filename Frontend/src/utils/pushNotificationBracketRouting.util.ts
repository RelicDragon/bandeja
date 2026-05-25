export type BracketScheduleNavigation = {
  leagueSeasonId: string;
  roundId?: string;
  group?: string;
};

export type NotificationTapRoute =
  | { kind: 'schedule-bracket'; nav: BracketScheduleNavigation }
  | { kind: 'game'; gameId: string };

export function resolveBracketScheduleNavigation(
  payload: Record<string, unknown> | null | undefined
): BracketScheduleNavigation | null {
  if (!payload || typeof payload.leagueSeasonId !== 'string' || !payload.leagueSeasonId) {
    return null;
  }
  if (payload.scheduleSubtab !== 'bracket') return null;
  const roundId =
    typeof payload.scheduleRoundId === 'string' && payload.scheduleRoundId
      ? payload.scheduleRoundId
      : undefined;
  const group =
    typeof payload.scheduleGroup === 'string' && payload.scheduleGroup
      ? payload.scheduleGroup
      : undefined;
  return { leagueSeasonId: payload.leagueSeasonId, roundId, group };
}

/** UX-C3: bracket assignment/advance pushes land on schedule bracket tab. */
export function resolveNotificationTapRoute(
  type: string,
  payload: Record<string, unknown> | null | undefined
): NotificationTapRoute | null {
  const bracketNav = resolveBracketScheduleNavigation(payload);
  if (
    bracketNav &&
    (type === 'GAME_REMINDER' || type === 'INVITE')
  ) {
    return { kind: 'schedule-bracket', nav: bracketNav };
  }
  const gameId = typeof payload?.gameId === 'string' ? payload.gameId : null;
  if (
    gameId &&
    (type === 'INVITE' ||
      type === 'GAME_CHAT' ||
      type === 'GAME_SYSTEM_MESSAGE' ||
      type === 'GAME_REMINDER' ||
      type === 'GAME_RESULTS' ||
      type === 'NEW_GAME')
  ) {
    return { kind: 'game', gameId };
  }
  return null;
}
