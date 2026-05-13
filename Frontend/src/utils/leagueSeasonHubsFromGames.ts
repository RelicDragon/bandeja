import type { Game } from '@/types';
import { isStalePastScheduledGame } from '@/utils/homeStaleScheduledGame';

export type LeagueSeasonHubRow = {
  hubId: string;
  leagueName: string;
  seasonTitle: string;
  avatarUrl: string | null;
  stalePastSchedule: boolean;
};

type HubAccum = Omit<LeagueSeasonHubRow, 'stalePastSchedule'>;

function pickStr(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const t = typeof c === 'string' ? c.trim() : '';
    if (t) return t;
  }
  return '';
}

/** Strip embedded schedule snippets from labels shown in “Your leagues”. */
export function stripDatesAndTimesFromLeagueHubLabel(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gi, ' ');
  s = s.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
  s = s.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ');
  s = s.replace(/\b\d{1,2}\.\s*\d{1,2}\.\s*\d{2,4}\b/g, ' ');
  s = s.replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/gi, ' ');
  s = s.replace(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/g, ' ');
  s = s.replace(/\b[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\b/g, ' ');
  s = s.replace(/[ \t]*[-–—,|]+[ \t]*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/^[-–—,|.\s]+|[-–—,|.\s]+$/g, '').trim();
  return s;
}

function cleanHubLabel(raw: string, fallback: string): string {
  const a = stripDatesAndTimesFromLeagueHubLabel(raw);
  if (a) return a;
  const b = stripDatesAndTimesFromLeagueHubLabel(fallback);
  if (b) return b;
  return fallback.trim() || raw.trim();
}

function mergeRow(prev: HubAccum, next: HubAccum): HubAccum {
  const leagueNameRaw = pickStr(prev.leagueName, next.leagueName);
  const seasonTitleRaw = pickStr(prev.seasonTitle, next.seasonTitle);
  const leagueName = cleanHubLabel(leagueNameRaw, seasonTitleRaw);
  const seasonTitle = cleanHubLabel(seasonTitleRaw, leagueNameRaw);
  return {
    hubId: prev.hubId,
    leagueName: leagueName || seasonTitle,
    seasonTitle: seasonTitle || leagueName,
    avatarUrl: prev.avatarUrl ?? next.avatarUrl ?? null,
  };
}

function isLeagueSeasonHubTerminal(
  g: Pick<Game, 'status' | 'resultsStatus'> & { entityType?: Game['entityType']; leagueSeason?: unknown }
): boolean {
  if (g.status === 'FINISHED' || g.status === 'ARCHIVED') return true;
  if (g.entityType === 'LEAGUE_SEASON' && g.resultsStatus === 'FINAL') return true;
  if (g.leagueSeason && g.resultsStatus === 'FINAL') return true;
  return false;
}

function hubIdFromGame(game: Game): string | null {
  if (game.entityType === 'LEAGUE_SEASON') return game.id;
  if (game.parent?.leagueSeason) return game.parent.id;
  const isLikelyLeagueFixture =
    !!(game.leagueRoundId || game.leagueRound || game.leagueGroupId || game.leagueGroup);
  if (game.parentId && isLikelyLeagueFixture) return game.parentId;
  if (game.leagueSeason?.id && isLikelyLeagueFixture) return game.leagueSeason.id;
  return null;
}

function rowFromGame(game: Game, hubId: string): HubAccum {
  const ls = game.entityType === 'LEAGUE_SEASON' ? game.leagueSeason : game.leagueSeason ?? game.parent?.leagueSeason;
  const leagueNameRaw = pickStr(ls?.league?.name, game.parent?.leagueSeason?.league?.name);
  const seasonTitleRaw = pickStr(
    ls?.game?.name,
    game.parent?.leagueSeason?.game?.name,
    game.entityType === 'LEAGUE_SEASON' ? game.name : '',
    leagueNameRaw
  );
  const leagueName = cleanHubLabel(leagueNameRaw, seasonTitleRaw);
  const seasonTitle = cleanHubLabel(seasonTitleRaw, leagueNameRaw);
  const avatarUrl =
    (ls?.game?.avatar ?? game.parent?.leagueSeason?.game?.avatar ?? game.avatar ?? null) || null;
  return {
    hubId,
    leagueName: leagueName || seasonTitle,
    seasonTitle: seasonTitle || leagueName,
    avatarUrl,
  };
}

export function leagueSeasonHubsFromGames(games: readonly Game[]): LeagueSeasonHubRow[] {
  const map = new Map<string, HubAccum>();
  const terminalHubIds = new Set<string>();
  for (const game of games) {
    const hubId = hubIdFromGame(game);
    if (!hubId) continue;
    if (game.id === hubId && game.entityType === 'LEAGUE_SEASON') {
      if (isLeagueSeasonHubTerminal(game)) terminalHubIds.add(hubId);
    } else if (game.parent?.id === hubId && game.parent.leagueSeason) {
      const p = game.parent;
      if (isLeagueSeasonHubTerminal(p)) terminalHubIds.add(hubId);
    }
    const row = rowFromGame(game, hubId);
    const existing = map.get(hubId);
    map.set(hubId, existing ? mergeRow(existing, row) : row);
  }
  const rows = [...map.values()]
    .filter((h) => !terminalHubIds.has(h.hubId))
    .sort((a, b) => {
      const ln = a.leagueName.localeCompare(b.leagueName, undefined, { sensitivity: 'base' });
      if (ln !== 0) return ln;
      return a.seasonTitle.localeCompare(b.seasonTitle, undefined, { sensitivity: 'base' });
    });
  return rows.map((row): LeagueSeasonHubRow => {
    const hubGame = games.find((g) => g.id === row.hubId && g.entityType === 'LEAGUE_SEASON');
    return {
      ...row,
      stalePastSchedule: hubGame ? isStalePastScheduledGame(hubGame) : false,
    };
  });
}
