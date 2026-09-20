import type { Sport } from '@prisma/client';
import {
  resolveStreakResult,
  type StreakOutcomeInput,
  type StreakResult,
} from '../user/userPerformanceInsights.service';
import {
  MONTHLY_RECAP_PAYLOAD_VERSION,
  type MonthlyRecapPayload,
  type RecapClub,
  type RecapLevel,
  type RecapPartner,
  type RecapSlide,
  type RecapSportGroup,
  type RecapVariant,
} from './recap.types';
import {
  RECAP_LOW_ACTIVITY_MAX_GAMES,
  dayOfMonthUtc,
  daysInMonthKey,
  monthKeyRange,
  monthWeekdayOffset,
} from './recapMonth';

/** One teammate appearance inside a decided match of a recap-month game. */
export type RecapPartnerAppearance = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  won: boolean;
};

/**
 * One finished game of the recap month, already flattened out of Prisma so the
 * builder below stays a pure function that fixtures can drive.
 */
export type RecapGameInput = {
  gameId: string;
  sport: Sport;
  /** When the game finished. Must fall inside the recap month's UTC window. */
  finishedAt: Date;
  club: { id: string; name: string; avatar: string | null } | null;
  /** Everything `resolveStreakResult` needs to classify the game as W / L / T. */
  outcome: StreakOutcomeInput;
  levelBefore: number;
  levelAfter: number;
  /** Teammates, one entry per decided match the user actually played with them. */
  partners: RecapPartnerAppearance[];
};

export type RecapLevelEventInput = {
  sport: Sport | null;
  levelBefore: number;
  levelAfter: number;
  createdAt: Date;
};

export type RecapBuildInput = {
  monthKey: string;
  owner: {
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    isPremium: boolean;
  };
  games: RecapGameInput[];
  /** `LevelChangeEvent` rows inside the month, oldest first. Drives the sparkline. */
  levelEvents: RecapLevelEventInput[];
  streak: { weeks: number; best: number } | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function winRatePct(wins: number, losses: number, ties: number): number | null {
  const decided = wins + losses + ties;
  if (decided === 0) return null;
  return Math.round((wins / decided) * 100);
}

/**
 * The partner the month was really about: most wins together, then most games
 * together, then the alphabetically stable name so a tie never flickers between
 * two scheduler runs.
 */
export function pickBestPartner(appearances: RecapPartnerAppearance[]): RecapPartner | null {
  const tally = new Map<string, RecapPartner>();
  for (const appearance of appearances) {
    const existing = tally.get(appearance.userId);
    if (existing) {
      existing.games += 1;
      if (appearance.won) existing.wins += 1;
      continue;
    }
    tally.set(appearance.userId, {
      userId: appearance.userId,
      firstName: appearance.firstName,
      lastName: appearance.lastName,
      avatar: appearance.avatar,
      wins: appearance.won ? 1 : 0,
      games: 1,
    });
  }

  const ranked = [...tally.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.games !== a.games) return b.games - a.games;
    return a.userId.localeCompare(b.userId);
  });
  return ranked[0] ?? null;
}

/** Most-played club of the month; ties break on the stable club id. */
export function pickTopClub(games: RecapGameInput[]): RecapClub | null {
  const tally = new Map<string, RecapClub>();
  for (const game of games) {
    if (!game.club) continue;
    const existing = tally.get(game.club.id);
    if (existing) {
      existing.games += 1;
      continue;
    }
    tally.set(game.club.id, {
      clubId: game.club.id,
      name: game.club.name,
      avatar: game.club.avatar,
      games: 1,
    });
  }
  const ranked = [...tally.values()].sort((a, b) => {
    if (b.games !== a.games) return b.games - a.games;
    return a.clubId.localeCompare(b.clubId);
  });
  return ranked[0] ?? null;
}

/**
 * Level journey for one sport. Prefers `LevelChangeEvent` rows (they carry the
 * whole month including non-game changes); falls back to the month's game
 * outcomes when the event log is empty, so a recap never silently loses the
 * slide because of a gap in the event table.
 */
export function buildRecapLevel(
  events: RecapLevelEventInput[],
  games: RecapGameInput[],
): RecapLevel | null {
  const ordered = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const points: number[] = [];
  if (ordered.length > 0) {
    points.push(round2(ordered[0].levelBefore));
    for (const event of ordered) points.push(round2(event.levelAfter));
  } else {
    const orderedGames = [...games].sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime());
    if (orderedGames.length === 0) return null;
    points.push(round2(orderedGames[0].levelBefore));
    for (const game of orderedGames) points.push(round2(game.levelAfter));
  }

  const before = points[0];
  const after = points[points.length - 1];
  if (points.length < 2) points.push(after);
  return { before, after, delta: round2(after - before), points };
}

function classify(outcome: StreakOutcomeInput): StreakResult {
  return resolveStreakResult(outcome);
}

function buildSportGroup(
  sport: Sport,
  games: RecapGameInput[],
  levelEvents: RecapLevelEventInput[],
): RecapSportGroup {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  const playedDays = new Set<number>();
  const partners: RecapPartnerAppearance[] = [];

  for (const game of games) {
    const result = classify(game.outcome);
    if (result === 'win') wins += 1;
    else if (result === 'tie') ties += 1;
    else losses += 1;
    playedDays.add(dayOfMonthUtc(game.finishedAt));
    partners.push(...game.partners);
  }

  const sportEvents = levelEvents.filter((event) => event.sport == null || event.sport === sport);

  return {
    sport,
    games: games.length,
    wins,
    losses,
    ties,
    winRatePct: winRatePct(wins, losses, ties),
    playedDays: [...playedDays].sort((a, b) => a - b),
    level: buildRecapLevel(sportEvents, games),
    partner: pickBestPartner(partners),
    club: pickTopClub(games),
  };
}

/**
 * Slide order is the PRD's highlight-reel order. A slide is only emitted when it
 * has something to say — an absent partner or club slide is better than a slide
 * that says "nobody".
 */
export function buildRecapSlides(
  variant: RecapVariant,
  sports: RecapSportGroup[],
): RecapSlide[] {
  const slides: RecapSlide[] = [
    { key: 'cover', kind: 'COVER', sport: null, sensitive: false },
  ];

  if (variant === 'LOW_ACTIVITY') {
    slides.push({ key: 'lowActivity', kind: 'LOW_ACTIVITY', sport: null, sensitive: false });
    slides.push({ key: 'outro', kind: 'OUTRO', sport: null, sensitive: false });
    return slides;
  }

  for (const group of sports) {
    const suffix = `:${group.sport}`;
    slides.push({ key: `games${suffix}`, kind: 'GAMES', sport: group.sport, sensitive: false });
    if (group.winRatePct != null) {
      slides.push({ key: `wins${suffix}`, kind: 'WINS', sport: group.sport, sensitive: false });
    }
    if (group.level) {
      slides.push({
        key: `level${suffix}`,
        kind: 'LEVEL',
        sport: group.sport,
        // A level drop is off by default in the share sheet. See PRD 353 story 10.
        sensitive: group.level.delta < 0,
      });
    }
    if (group.partner) {
      slides.push({ key: `partner${suffix}`, kind: 'PARTNER', sport: group.sport, sensitive: false });
    }
    if (group.club) {
      slides.push({ key: `club${suffix}`, kind: 'CLUB', sport: group.sport, sensitive: false });
    }
  }

  slides.push({ key: 'streak', kind: 'STREAK', sport: null, sensitive: false });
  slides.push({ key: 'outro', kind: 'OUTRO', sport: null, sensitive: false });
  return slides;
}

export function buildMonthlyRecapPayload(input: RecapBuildInput): MonthlyRecapPayload {
  const { start, end } = monthKeyRange(input.monthKey);
  const games = input.games.filter(
    (game) => game.finishedAt >= start && game.finishedAt < end,
  );

  const bySport = new Map<Sport, RecapGameInput[]>();
  for (const game of games) {
    const list = bySport.get(game.sport) ?? [];
    list.push(game);
    bySport.set(game.sport, list);
  }

  const sports = [...bySport.entries()]
    .map(([sport, sportGames]) => buildSportGroup(sport, sportGames, input.levelEvents))
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return a.sport.localeCompare(b.sport);
    });

  const variant: RecapVariant =
    games.length <= RECAP_LOW_ACTIVITY_MAX_GAMES ? 'LOW_ACTIVITY' : 'FULL';

  const totals = sports.reduce(
    (acc, group) => ({
      games: acc.games + group.games,
      wins: acc.wins + group.wins,
      losses: acc.losses + group.losses,
      ties: acc.ties + group.ties,
    }),
    { games: 0, wins: 0, losses: 0, ties: 0 },
  );

  const playedDays = [
    ...new Set(games.map((game) => dayOfMonthUtc(game.finishedAt))),
  ].sort((a, b) => a - b);
  const clubIds = new Set(games.map((game) => game.club?.id).filter((id): id is string => !!id));
  const partnerIds = new Set(games.flatMap((game) => game.partners.map((p) => p.userId)));

  // The streak slide would be a lie at zero, and the low-activity reel has no
  // room for it anyway.
  const streak =
    variant === 'FULL' && input.streak && input.streak.weeks > 0 ? input.streak : null;

  const slides = buildRecapSlides(variant, sports).filter(
    (slide) => slide.kind !== 'STREAK' || streak != null,
  );

  return {
    version: MONTHLY_RECAP_PAYLOAD_VERSION,
    monthKey: input.monthKey,
    monthStart: start.toISOString(),
    daysInMonth: daysInMonthKey(input.monthKey),
    weekdayOffset: monthWeekdayOffset(input.monthKey),
    variant,
    sports,
    totals: {
      ...totals,
      winRatePct: winRatePct(totals.wins, totals.losses, totals.ties),
      playedDays,
      clubs: clubIds.size,
      partners: partnerIds.size,
    },
    streak,
    owner: input.owner,
    slides,
  };
}
