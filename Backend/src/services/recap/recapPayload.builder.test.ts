import assert from 'node:assert/strict';
import { Sport, WinnerOfGame } from '@prisma/client';
import {
  buildMonthlyRecapPayload,
  buildRecapLevel,
  pickBestPartner,
  pickTopClub,
  type RecapBuildInput,
  type RecapGameInput,
  type RecapPartnerAppearance,
} from './recapPayload.builder';

const MONTH = '2026-09';

const OWNER: RecapBuildInput['owner'] = {
  firstName: 'Mia',
  lastName: 'Ortiz',
  avatar: null,
  isPremium: false,
};

function day(dayOfMonth: number): Date {
  return new Date(`2026-09-${`${dayOfMonth}`.padStart(2, '0')}T18:00:00.000Z`);
}

function partner(userId: string, won: boolean): RecapPartnerAppearance {
  return { userId, firstName: userId.toUpperCase(), lastName: null, avatar: null, won };
}

function game(overrides: {
  id: string;
  dayOfMonth: number;
  sport?: Sport;
  won?: boolean;
  tie?: boolean;
  club?: { id: string; name: string } | null;
  levelBefore?: number;
  levelAfter?: number;
  partners?: RecapPartnerAppearance[];
}): RecapGameInput {
  const won = overrides.won ?? false;
  const tie = overrides.tie ?? false;
  return {
    gameId: overrides.id,
    sport: overrides.sport ?? Sport.PADEL,
    finishedAt: day(overrides.dayOfMonth),
    club: overrides.club
      ? { id: overrides.club.id, name: overrides.club.name, avatar: null }
      : null,
    outcome: {
      isWinner: won,
      isWinForStreak: tie ? null : won,
      wins: won ? 2 : 0,
      ties: tie ? 2 : 0,
      losses: won || tie ? 0 : 2,
      scoresMade: won ? 12 : 6,
      scoresLost: won ? 6 : 12,
      position: null,
      // A tie only survives `resolveStreakResult` when nothing classifies it as
      // a win first, which is exactly the shape a drawn game stores.
      winnerOfGame: tie ? undefined : WinnerOfGame.BY_MATCHES_WON,
      createdAt: day(overrides.dayOfMonth),
    },
    levelBefore: overrides.levelBefore ?? 3.9,
    levelAfter: overrides.levelAfter ?? 3.9,
    partners: overrides.partners ?? [],
  };
}

function build(overrides: Partial<RecapBuildInput>): ReturnType<typeof buildMonthlyRecapPayload> {
  return buildMonthlyRecapPayload({
    monthKey: MONTH,
    owner: OWNER,
    games: [],
    levelEvents: [],
    streak: null,
    ...overrides,
  });
}

// --- fixture 1: single sport ----------------------------------------------

const singleSport = build({
  games: [
    game({ id: 'g1', dayOfMonth: 2, won: true, club: { id: 'c1', name: 'Padel Centar' }, partners: [partner('ana', true)] }),
    game({ id: 'g2', dayOfMonth: 2, won: true, club: { id: 'c1', name: 'Padel Centar' }, partners: [partner('ana', true)] }),
    game({ id: 'g3', dayOfMonth: 9, won: false, club: { id: 'c2', name: 'Arena' }, partners: [partner('bo', false)] }),
    game({ id: 'g4', dayOfMonth: 17, tie: true, club: { id: 'c1', name: 'Padel Centar' } }),
  ],
  levelEvents: [
    { sport: Sport.PADEL, levelBefore: 3.9, levelAfter: 3.95, createdAt: day(2) },
    { sport: Sport.PADEL, levelBefore: 3.95, levelAfter: 4.1, createdAt: day(17) },
  ],
  streak: { weeks: 4, best: 6 },
});

assert.equal(singleSport.variant, 'FULL');
assert.equal(singleSport.sports.length, 1);
assert.equal(singleSport.totals.games, 4);
assert.equal(singleSport.totals.wins, 2);
assert.equal(singleSport.totals.losses, 1);
assert.equal(singleSport.totals.ties, 1);
assert.equal(singleSport.totals.winRatePct, 50);
assert.deepEqual(singleSport.totals.playedDays, [2, 9, 17], 'a day with two games is counted once');
assert.equal(singleSport.totals.clubs, 2);
assert.equal(singleSport.totals.partners, 2);
assert.equal(singleSport.daysInMonth, 30);
assert.equal(singleSport.weekdayOffset, 1, '2026-09-01 is a Tuesday');

const padel = singleSport.sports[0];
assert.equal(padel.club?.name, 'Padel Centar', 'the most played club wins');
assert.equal(padel.club?.games, 3);
assert.equal(padel.partner?.userId, 'ana');
assert.equal(padel.partner?.wins, 2);
assert.equal(padel.partner?.games, 2);
assert.deepEqual(padel.level, { before: 3.9, after: 4.1, delta: 0.2, points: [3.9, 3.95, 4.1] });

assert.deepEqual(
  singleSport.slides.map((slide) => slide.key),
  ['cover', 'games:PADEL', 'wins:PADEL', 'level:PADEL', 'partner:PADEL', 'club:PADEL', 'streak', 'outro'],
);
assert.equal(
  singleSport.slides.every((slide) => !slide.sensitive),
  true,
  'nothing is sensitive when the level went up',
);

// --- fixture 2: multisport -------------------------------------------------

const multisport = build({
  games: [
    game({ id: 'p1', dayOfMonth: 3, won: true }),
    game({ id: 'p2', dayOfMonth: 4, won: true }),
    game({ id: 't1', dayOfMonth: 5, sport: Sport.TENNIS, won: false }),
    game({ id: 't2', dayOfMonth: 6, sport: Sport.TENNIS, won: true }),
    game({ id: 't3', dayOfMonth: 7, sport: Sport.TENNIS, won: true }),
  ],
});

assert.equal(multisport.sports.length, 2);
assert.equal(multisport.sports[0].sport, Sport.TENNIS, 'the most played sport leads');
assert.equal(multisport.sports[0].games, 3);
assert.equal(multisport.sports[1].sport, Sport.PADEL);
assert.deepEqual(
  multisport.slides.filter((slide) => slide.kind === 'GAMES').map((slide) => slide.key),
  ['games:TENNIS', 'games:PADEL'],
  'one slide group per sport, in the same order as the groups',
);

// --- fixture 3: low activity ----------------------------------------------

const lowActivity = build({ games: [game({ id: 'only', dayOfMonth: 12, won: true })] });
assert.equal(lowActivity.variant, 'LOW_ACTIVITY');
assert.deepEqual(
  lowActivity.slides.map((slide) => slide.key),
  ['cover', 'lowActivity', 'outro'],
  'the come-back reel is three slides, never an empty stats reel',
);

const noActivity = build({ games: [] });
assert.equal(noActivity.variant, 'LOW_ACTIVITY');
assert.equal(noActivity.totals.games, 0);
assert.equal(noActivity.sports.length, 0);
assert.equal(noActivity.streak, null, 'no streak slide on an empty month');

// --- fixture 4: negative level --------------------------------------------

const negativeLevel = build({
  games: [
    game({ id: 'n1', dayOfMonth: 2, won: false }),
    game({ id: 'n2', dayOfMonth: 5, won: false }),
    game({ id: 'n3', dayOfMonth: 8, won: true }),
  ],
  levelEvents: [
    { sport: Sport.PADEL, levelBefore: 4.0, levelAfter: 3.9, createdAt: day(2) },
    { sport: Sport.PADEL, levelBefore: 3.9, levelAfter: 3.8, createdAt: day(5) },
  ],
});

const levelSlide = negativeLevel.slides.find((slide) => slide.kind === 'LEVEL');
assert.ok(levelSlide, 'a level drop still gets its slide');
assert.equal(levelSlide.sensitive, true, 'a level drop is off by default in the share sheet');
assert.equal(negativeLevel.sports[0].level?.delta, -0.2);
assert.equal(
  negativeLevel.slides.filter((slide) => slide.sensitive).length,
  1,
  'only the level slide is ever marked sensitive',
);

// --- games outside the month are dropped ----------------------------------

const spill = build({
  games: [
    game({ id: 'in', dayOfMonth: 30, won: true }),
    {
      ...game({ id: 'out', dayOfMonth: 1, won: true }),
      finishedAt: new Date('2026-10-01T00:00:00.000Z'),
    },
    {
      ...game({ id: 'before', dayOfMonth: 1, won: true }),
      finishedAt: new Date('2026-08-31T23:59:59.999Z'),
    },
  ],
});
assert.equal(spill.totals.games, 1, 'the month window is half-open [start, end)');

// --- units -----------------------------------------------------------------

assert.equal(pickBestPartner([]), null);
assert.equal(
  pickBestPartner([partner('a', true), partner('b', true), partner('b', false)])?.userId,
  'b',
  'more games together breaks a tie on wins',
);
assert.equal(
  pickBestPartner([partner('z', true), partner('z', true), partner('a', true)])?.userId,
  'z',
  'more wins wins outright',
);

assert.equal(pickTopClub([game({ id: 'x', dayOfMonth: 1 })]), null, 'a game with no club has no club');

assert.equal(buildRecapLevel([], []), null);
assert.deepEqual(
  buildRecapLevel([], [game({ id: 'l', dayOfMonth: 1, levelBefore: 3.0, levelAfter: 3.25 })]),
  { before: 3, after: 3.25, delta: 0.25, points: [3, 3.25] },
  'the game outcomes are the fallback when the event log is empty',
);

console.log('✅ recapPayload.builder tests passed');
