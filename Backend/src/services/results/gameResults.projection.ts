/**
 * Whitelist projection for `GET /api/results/game/:gameId` and its spectator twin.
 *
 * The endpoint used to run a top-level Prisma `include`, which loads **every**
 * `Game` scalar — so PRD 348's free-text `Game.paymentHint` (an IBAN, a Revolut
 * handle, a phone number) went out with the scoreboard, together with
 * `description`, `metadata`-adjacent summary text, `mediaUrls`, `externalUrl`,
 * `priceTotal` and every player's `bio` / `weeklyAvailability` / `socialLevel`.
 *
 * The house pattern is `availableGamesCard.projection.ts`: an explicit `select`
 * plus a machine-readable forbidden list that a test asserts against. This is
 * the same shape for the results surface.
 *
 * Adding a field here is a deliberate act: the payload is served to spectators
 * holding a signed live token, i.e. to people with no account at all.
 */
import type { Prisma } from '@prisma/client';
import { USER_SPORT_PROFILE_SELECT } from '../../utils/constants';

/**
 * Player projection for the results payload.
 *
 * Deliberately **not** `USER_SELECT_WITH_SPORT_PROFILES`: that constant carries
 * `bio`, `verbalStatus`, `weeklyAvailability`, `availabilityBucketBoundaries`
 * and `socialLevel`, none of which a scoreboard needs and all of which are on
 * the Find-card forbidden list for exactly this reason.
 */
export const RESULTS_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  primarySport: true,
  gender: true,
  genderIsSet: true,
  approvedLevel: true,
  isTrainer: true,
  isPremium: true,
  showPremiumStatus: true,
  trainerRating: true,
  trainerReviewCount: true,
  sportsEnabled: true,
  sportProfiles: {
    select: USER_SPORT_PROFILE_SELECT,
  },
} as const satisfies Prisma.UserSelect;

/**
 * `Game` scalars the results / live-board surfaces actually read.
 *
 * The format block (`scoringPreset` … `metadata`) is load-bearing: the frontend
 * derives the whole rulebook from it (`Frontend/src/utils/scoring/rulebook.ts`
 * `getRules`), and the spectator board has no second source for it because it
 * never calls `GET /api/games/:id`.
 */
export const RESULTS_GAME_SCALAR_SELECT = {
  id: true,
  entityType: true,
  sport: true,
  gameType: true,
  name: true,
  avatar: true,
  originalAvatar: true,
  clubId: true,
  courtId: true,
  cityId: true,
  startTime: true,
  endTime: true,
  maxParticipants: true,
  playersPerMatch: true,
  minParticipants: true,
  minLevel: true,
  maxLevel: true,
  isPublic: true,
  affectsRating: true,
  hasFixedTeams: true,
  allowUserInMultipleTeams: true,
  genderTeams: true,
  status: true,
  resultsStatus: true,
  finishedDate: true,
  timeIsSet: true,
  timeOverride: true,
  parentId: true,
  trainerId: true,
  leagueRoundId: true,
  leagueGroupId: true,
  seriesId: true,
  /* Scoring format — the rulebook source. */
  fixedNumberOfSets: true,
  maxTotalPointsPerSet: true,
  matchTimedCapMinutes: true,
  matchTimerEnabled: true,
  maxPointsPerTeam: true,
  winnerOfGame: true,
  winnerOfMatch: true,
  matchGenerationType: true,
  pointsPerWin: true,
  pointsPerLoose: true,
  pointsPerTie: true,
  ballsInGames: true,
  scoringPreset: true,
  scoringMode: true,
  deucesBeforeGoldenPoint: true,
  /**
   * Carries the officiating level and the automatic-record mode the live board
   * needs (`getOfficiatingLevelForGame`). Game *format* configuration, not user
   * text — unlike `description` / `lastMessagePreview`, which stay out.
   */
  metadata: true,
} as const satisfies Prisma.GameSelect;

const resultsMatchSelect = {
  id: true,
  roundId: true,
  matchNumber: true,
  winnerId: true,
  courtId: true,
  metadata: true,
  timerStatus: true,
  timerStartedAt: true,
  timerPausedAt: true,
  timerElapsedMs: true,
  timerCapMinutes: true,
  timerExpiryNotifiedAt: true,
  timerUpdatedBy: true,
  timerUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  teams: {
    select: {
      id: true,
      matchId: true,
      teamNumber: true,
      score: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      players: {
        select: {
          id: true,
          teamId: true,
          userId: true,
          createdAt: true,
          user: { select: RESULTS_USER_SELECT },
        },
      },
    },
  },
  sets: {
    orderBy: { setNumber: 'asc' as const },
    select: {
      id: true,
      matchId: true,
      setNumber: true,
      teamAScore: true,
      teamBScore: true,
      isTieBreak: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

const resultsOutcomeSelect = {
  id: true,
  gameId: true,
  userId: true,
  levelBefore: true,
  levelAfter: true,
  levelChange: true,
  reliabilityBefore: true,
  reliabilityAfter: true,
  reliabilityChange: true,
  pointsEarned: true,
  position: true,
  isWinner: true,
  isWinForStreak: true,
  wins: true,
  ties: true,
  losses: true,
  scoresMade: true,
  scoresLost: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  user: { select: RESULTS_USER_SELECT },
} as const;

/** Full `select` for {@link getGameResults} — never an `include`. */
export function getGameResultsSelect(): Prisma.GameSelect {
  return {
    ...RESULTS_GAME_SCALAR_SELECT,
    rounds: {
      orderBy: { roundNumber: 'asc' },
      select: {
        id: true,
        gameId: true,
        roundNumber: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        matches: {
          orderBy: { matchNumber: 'asc' },
          select: resultsMatchSelect,
        },
        outcomes: {
          select: {
            id: true,
            roundId: true,
            userId: true,
            levelChange: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            user: { select: RESULTS_USER_SELECT },
          },
        },
      },
    },
    outcomes: {
      orderBy: { position: 'asc' },
      select: resultsOutcomeSelect,
    },
    leagueGroup: {
      select: { id: true, name: true, color: true },
    },
    leagueRound: {
      select: {
        id: true,
        orderIndex: true,
        roundType: true,
        playoffFormat: true,
        bracketScope: true,
        entrantCount: true,
        bracketSize: true,
      },
    },
    bracketSlot: {
      select: { slotKind: true, roundIndex: true },
    },
    parent: {
      select: {
        id: true,
        leagueSeason: {
          select: {
            id: true,
            leagueId: true,
            sport: true,
            league: { select: { id: true, name: true } },
            game: {
              select: {
                id: true,
                name: true,
                avatar: true,
                originalAvatar: true,
                sport: true,
              },
            },
          },
        },
      },
    },
  };
}

/** `Game` scalars that must never reach a results response. */
export const RESULTS_FORBIDDEN_GAME_KEYS = [
  'paymentHint',
  'paymentMethods',
  'costPayerId',
  'priceTotal',
  'priceType',
  'priceCurrency',
  'costFrozenAt',
  'description',
  'mediaUrls',
  'externalUrl',
  'venueText',
  'lastMessagePreview',
  'telegramResultsSummary',
  'resultsSummaryText',
  'resultsMeta',
  'weatherAlertState',
  'lastSeatOpenedAt',
  'seriesOccurrenceDate',
] as const;

/** User fields that must never reach a results response. */
export const RESULTS_FORBIDDEN_USER_KEYS = [
  'bio',
  'verbalStatus',
  'weeklyAvailability',
  'availabilityBucketBoundaries',
  'socialLevel',
  'phone',
  'email',
  'telegramId',
  'wallet',
] as const;

export type GameResultsContractIssue = {
  path: string;
  reason: string;
};

function collectUserIssues(
  user: unknown,
  path: string,
  issues: GameResultsContractIssue[],
): void {
  if (!user || typeof user !== 'object') return;
  const row = user as Record<string, unknown>;
  for (const key of RESULTS_FORBIDDEN_USER_KEYS) {
    if (key in row) {
      issues.push({ path: `${path}.${key}`, reason: `${key} must not reach a results response` });
    }
  }
}

/**
 * Contract check for one results payload. Used by the regression test and cheap
 * enough to call from an integration test on every fixture.
 */
export function collectGameResultsContractIssues(
  payload: unknown,
): GameResultsContractIssue[] {
  const issues: GameResultsContractIssue[] = [];
  if (!payload || typeof payload !== 'object') {
    issues.push({ path: '', reason: 'not an object' });
    return issues;
  }
  const game = payload as Record<string, unknown>;

  for (const key of RESULTS_FORBIDDEN_GAME_KEYS) {
    if (key in game) {
      issues.push({ path: key, reason: `${key} must not reach a results response` });
    }
  }

  const outcomes = Array.isArray(game.outcomes) ? game.outcomes : [];
  outcomes.forEach((outcome, index) => {
    collectUserIssues(
      (outcome as Record<string, unknown> | null)?.user,
      `outcomes[${index}].user`,
      issues,
    );
  });

  const rounds = Array.isArray(game.rounds) ? game.rounds : [];
  rounds.forEach((round, roundIndex) => {
    const r = (round ?? {}) as Record<string, unknown>;
    const roundOutcomes = Array.isArray(r.outcomes) ? r.outcomes : [];
    roundOutcomes.forEach((outcome, index) => {
      collectUserIssues(
        (outcome as Record<string, unknown> | null)?.user,
        `rounds[${roundIndex}].outcomes[${index}].user`,
        issues,
      );
    });
    const matches = Array.isArray(r.matches) ? r.matches : [];
    matches.forEach((match, matchIndex) => {
      const teams = Array.isArray((match as Record<string, unknown>)?.teams)
        ? ((match as Record<string, unknown>).teams as unknown[])
        : [];
      teams.forEach((team, teamIndex) => {
        const players = Array.isArray((team as Record<string, unknown>)?.players)
          ? ((team as Record<string, unknown>).players as unknown[])
          : [];
        players.forEach((player, playerIndex) => {
          collectUserIssues(
            (player as Record<string, unknown> | null)?.user,
            `rounds[${roundIndex}].matches[${matchIndex}].teams[${teamIndex}].players[${playerIndex}].user`,
            issues,
          );
        });
      });
    });
  });

  return issues;
}

export function assertGameResultsContract(payload: unknown): void {
  const issues = collectGameResultsContractIssues(payload);
  if (issues.length > 0) {
    const detail = issues.map((issue) => `${issue.path}: ${issue.reason}`).join('; ');
    throw new Error(`Game results contract failed: ${detail}`);
  }
}
