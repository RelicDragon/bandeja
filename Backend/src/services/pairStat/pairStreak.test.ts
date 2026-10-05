/**
 * Weekly pair streak — the solo play-streak week rules applied to the pair's
 * same-side games, with the solo "rated" filter.
 */

import { EntityType } from '@prisma/client';
import { computePairStreak, pairStreakPlayAts, type PairStreakGame } from './pairStreak';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const TZ = 'Europe/Prague';

function atLocal(ymd: string, hms = '12:00:00'): Date {
  return new Date(`${ymd}T${hms}+01:00`);
}

function game(ymd: string, overrides: Partial<PairStreakGame> = {}): PairStreakGame {
  return { entityType: EntityType.GAME, affectsRating: true, playedAt: atLocal(ymd), ...overrides };
}

// Rated filter: unrated / BAR / LEAGUE_SEASON / EVENT never count; LEAGUE and TOURNAMENT do.
{
  const plays = pairStreakPlayAts([
    game('2026-01-06'),
    game('2026-01-07', { affectsRating: false }),
    game('2026-01-08', { entityType: EntityType.BAR }),
    game('2026-01-09', { entityType: EntityType.LEAGUE_SEASON }),
    game('2026-01-10', { entityType: EntityType.EVENT }),
    game('2026-01-11', { entityType: EntityType.LEAGUE }),
    game('2026-01-12', { entityType: EntityType.TOURNAMENT }),
  ]);
  assert(plays.length === 3, `rated filter keeps 3, got ${plays.length}`);
  assert(plays[0]!.getTime() < plays[1]!.getTime(), 'sorted ascending');
}

// No games → nothing.
{
  const view = computePairStreak([], TZ, atLocal('2026-01-10'), { includeAtRisk: true });
  assert(view.current === 0 && view.best === 0, 'empty → 0 / 0');
  assert(view.atRisk === false && view.lastPlayAt === null, 'empty is never at risk');
}

// Three consecutive weeks, extra games in the same week do not add weeks; input order irrelevant.
{
  const games = [game('2026-01-20'), game('2026-01-06'), game('2026-01-08'), game('2026-01-13')];
  const view = computePairStreak(games, TZ, atLocal('2026-01-21'), { includeAtRisk: true });
  assert(view.current === 3, `3 weeks in a row, got ${view.current}`);
  assert(view.best === 3, 'best 3');
  assert(view.atRisk === false, 'just played → not at risk');
}

// At risk: alive, within 48h of the deadline (last play + 7 days, end of local day).
{
  const games = [game('2026-01-06'), game('2026-01-13')];
  const now = atLocal('2026-01-19', '10:00:00');
  const member = computePairStreak(games, TZ, now, { includeAtRisk: true });
  assert(member.current === 2, 'still alive on day 6');
  assert(member.atRisk === true, 'member sees at risk inside 48h');
  assert(member.hoursLeft !== null && member.hoursLeft <= 48, 'hours left reported');
  const stranger = computePairStreak(games, TZ, now, { includeAtRisk: false });
  assert(stranger.atRisk === false && stranger.hoursLeft === null, 'non-members never see at risk');
}

// Broken: current 0, best survives; a new run restarts at 1.
{
  const games = [game('2026-01-06'), game('2026-01-13'), game('2026-01-20'), game('2026-02-10')];
  const view = computePairStreak(games, TZ, atLocal('2026-02-11'), { includeAtRisk: true });
  assert(view.current === 1, `restart after a gap → 1, got ${view.current}`);
  assert(view.best === 3, `best keeps 3, got ${view.best}`);
  const later = computePairStreak(games, TZ, atLocal('2026-03-01'), { includeAtRisk: true });
  assert(later.current === 0 && later.best === 3, 'lapsed → 0, best 3');
}

// Unrated games together do not keep the streak alive.
{
  const games = [game('2026-01-06'), game('2026-01-13', { affectsRating: false })];
  const view = computePairStreak(games, TZ, atLocal('2026-01-13', '20:00:00'), { includeAtRisk: true });
  assert(view.current === 1, 'unrated week does not advance');
}

console.log('pairStreak.test.ts OK');
