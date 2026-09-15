import assert from 'node:assert/strict';
import {
  EntityType,
  GameStatus,
  GameType,
  Gender,
  ResultsStatus,
  Sport,
  WinnerOfGame,
} from '@prisma/client';
import {
  buildPerformanceRelationships,
  buildPerformanceStreaks,
  isRelationshipInsightMatch,
  resolveStreakResult,
  type PerformanceRelationshipGame,
  type RelationshipMatchInput,
  type StreakOutcomeInput,
} from './userPerformanceInsights.service';

const configuredOutcome = (input: {
  winnerOfGame: WinnerOfGame;
  isWinner?: boolean;
  wins?: number;
  losses?: number;
  scoresMade?: number;
  scoresLost?: number;
  position?: number | null;
  leaderboardLastPlace?: number;
}): StreakOutcomeInput => ({
  isWinner: input.isWinner ?? false,
  wins: input.wins ?? 0,
  ties: 0,
  losses: input.losses ?? 0,
  scoresMade: input.scoresMade ?? 0,
  scoresLost: input.scoresLost ?? 0,
  position: input.position ?? null,
  leaderboardLastPlace: input.leaderboardLastPlace ?? null,
  winnerOfGame: input.winnerOfGame,
  createdAt: new Date(Date.UTC(2026, 0, 1)),
});

(() => {
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_SCORES_DELTA,
    scoresMade: 20,
    scoresLost: 20,
  })), 'win', 'zero ball delta counts as a streak win');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_SCORES_DELTA,
    scoresMade: 19,
    scoresLost: 20,
  })), 'loss', 'negative ball delta counts as a streak loss');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    wins: 2,
    losses: 2,
  })), 'win', 'zero match-win delta counts as a streak win');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    wins: 0,
    losses: 0,
  })), 'win', '0-0 match record is a streak win, not “must win at least one match”');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    wins: 1,
    losses: 2,
  })), 'loss', 'negative match-win delta counts as a streak loss even with one match won');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_POINTS,
    position: 4,
    leaderboardLastPlace: 32,
  })), 'win', 'fourth place in a 32-place leaderboard counts as a streak win');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_POINTS,
    position: 17,
    leaderboardLastPlace: 32,
  })), 'loss', 'bottom-half placement counts as a streak loss');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_POINTS,
    position: 3,
    leaderboardLastPlace: 5,
  })), 'win', 'the middle place of an odd-sized leaderboard is in the inclusive top half');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.BY_SCORES_MADE,
    position: 2,
    leaderboardLastPlace: 2,
  })), 'loss', 'balls-won ranking follows leaderboard half instead of making every nonnegative total a win');
  assert.equal(resolveStreakResult(configuredOutcome({
    winnerOfGame: WinnerOfGame.PLAYOFF_FINALS,
    wins: 1,
    losses: 1,
  })), 'win', 'playoff match delta follows match-won semantics');
  assert.equal(resolveStreakResult({
    ...configuredOutcome({
      winnerOfGame: WinnerOfGame.BY_SCORES_DELTA,
      scoresMade: 0,
      scoresLost: 10,
    }),
    isWinForStreak: true,
  }), 'win', 'persisted classification is the historical authority');
})();

const outcome = (
  result: 'win' | 'loss' | 'tie',
  index: number,
): StreakOutcomeInput => ({
  isWinner: result === 'win',
  wins: result === 'win' ? 1 : 0,
  ties: result === 'tie' ? 1 : 0,
  losses: result === 'loss' ? 1 : 0,
  createdAt: new Date(Date.UTC(2026, 0, index + 1)),
});

const user = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: '',
  avatar: null,
  primarySport: Sport.PADEL,
  sportsEnabled: [Sport.PADEL],
  sportProfiles: [],
  socialLevel: 0,
  gender: Gender.PREFER_NOT_TO_SAY,
  genderIsSet: false,
  approvedLevel: false,
  isTrainer: false,
  verbalStatus: null,
  bio: null,
  isPremium: false,
  trainerRating: null,
  trainerReviewCount: 0,
  weeklyAvailability: null,
  availabilityBucketBoundaries: null,
});

const team = (id: string, players: ReturnType<typeof user>[]) => ({
  id,
  players: players.map((player) => ({ userId: player.id, user: player })),
});

const match = (
  winnerTeamId: string | null,
  teams: ReturnType<typeof team>[],
  ratingDelta?: number,
  game?: PerformanceRelationshipGame,
): RelationshipMatchInput<ReturnType<typeof user>> => ({
  winnerTeamId,
  ratingDelta,
  game,
  teams,
});

const firstRank = <T,>(ranks: T[]): T | undefined => ranks[0];

const rankIds = (ranks: Array<{ user: { id: string } }>): string[] => ranks.map((rank) => rank.user.id);

const winsWith = (
  current: ReturnType<typeof user>,
  partner: ReturnType<typeof user>,
  opponents: [ReturnType<typeof user>, ReturnType<typeof user>],
  count: number,
  prefix: string,
): RelationshipMatchInput<ReturnType<typeof user>>[] => Array.from({ length: count }, (_, index) => (
  match(`${prefix}-us-${index}`, [
    team(`${prefix}-us-${index}`, [current, partner]),
    team(`${prefix}-them-${index}`, opponents),
  ])
));

const lossesWith = (
  current: ReturnType<typeof user>,
  partner: ReturnType<typeof user>,
  opponents: [ReturnType<typeof user>, ReturnType<typeof user>],
  count: number,
  prefix: string,
): RelationshipMatchInput<ReturnType<typeof user>>[] => Array.from({ length: count }, (_, index) => (
  match(`${prefix}-them-${index}`, [
    team(`${prefix}-us-${index}`, [current, partner]),
    team(`${prefix}-them-${index}`, opponents),
  ])
));

const relationshipGame = (
  id: string,
  day: number,
  overrides: Partial<PerformanceRelationshipGame> = {},
): PerformanceRelationshipGame => ({
  id,
  name: null,
  sport: Sport.PADEL,
  gameType: GameType.CLASSIC,
  entityType: EntityType.GAME,
  startTime: new Date(Date.UTC(2026, 0, day, 18)),
  endTime: new Date(Date.UTC(2026, 0, day, 20)),
  status: GameStatus.FINISHED,
  resultsStatus: ResultsStatus.FINAL,
  affectsRating: true,
  club: { id: `club-${id}`, name: `Club ${id}` },
  court: { id: `court-${id}`, name: `Court ${id}` },
  ...overrides,
});

(() => {
  assert.equal(
    isRelationshipInsightMatch({
      sets: [{ teamAScore: 11, teamBScore: 5, role: 'OFFICIAL' }],
    }),
    true,
    'relationship insights count legacy final scores even when current rulebook would not rate them',
  );
  assert.equal(
    isRelationshipInsightMatch({
      sets: [{ teamAScore: 0, teamBScore: 0, role: 'OFFICIAL' }],
    }),
    false,
  );
  assert.equal(
    isRelationshipInsightMatch({
      sets: [{ teamAScore: 11, teamBScore: 5, role: 'EXTRA_GAMES' }],
    }),
    false,
  );
})();

(() => {
  const streaks = buildPerformanceStreaks([
    outcome('win', 0),
    outcome('loss', 1),
    outcome('loss', 2),
    outcome('tie', 3),
    outcome('win', 4),
    outcome('win', 5),
    outcome('win', 6),
    outcome('loss', 7),
    outcome('loss', 8),
    outcome('loss', 9),
    outcome('loss', 10),
    outcome('tie', 11),
  ]);

  assert.deepEqual(streaks.recentGames, [
    'loss',
    'tie',
    'win',
    'win',
    'win',
    'loss',
    'loss',
    'loss',
    'loss',
    'tie',
  ]);
  assert.deepEqual(streaks.current, { result: 'tie', count: 1 });
  assert.equal(streaks.longestWin, 3);
  assert.equal(streaks.longestLoss, 4);
})();

(() => {
  const streaks = buildPerformanceStreaks([
    outcome('tie', 0),
    outcome('win', 1),
    outcome('win', 2),
    outcome('win', 3),
  ]);

  assert.deepEqual(streaks.current, { result: 'win', count: 3 });
  assert.equal(streaks.longestLoss, 0);
})();

(() => {
  const current = user('u-current', 'Current');
  const highWinPartner = user('u-high-win-partner', 'HighWin');
  const netBestPartner = user('u-net-best-partner', 'NetBest');
  const highLossPartner = user('u-high-loss-partner', 'HighLoss');
  const netWorstPartner = user('u-net-worst-partner', 'NetWorst');
  const opponentA = user('u-opponent-a', 'OpponentA');
  const opponentB = user('u-opponent-b', 'OpponentB');

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-current-high-win-1', [
        team('team-current-high-win-1', [current, highWinPartner]),
        team('team-opponents-1', [opponentA, opponentB]),
      ], 0.01),
      match('team-current-high-win-2', [
        team('team-current-high-win-2', [current, highWinPartner]),
        team('team-opponents-2', [opponentA, opponentB]),
      ], 0.01),
      match('team-current-net-best', [
        team('team-current-net-best', [current, netBestPartner]),
        team('team-opponents-3', [opponentA, opponentB]),
      ], 0.08),
      match('team-opponents-4', [
        team('team-current-high-loss-1', [current, highLossPartner]),
        team('team-opponents-4', [opponentA, opponentB]),
      ], -0.01),
      match('team-opponents-5', [
        team('team-current-high-loss-2', [current, highLossPartner]),
        team('team-opponents-5', [opponentA, opponentB]),
      ], -0.01),
      match('team-opponents-6', [
        team('team-current-net-worst', [current, netWorstPartner]),
        team('team-opponents-6', [opponentA, opponentB]),
      ], -0.08),
    ],
    Sport.PADEL,
  );

  assert.ok(firstRank(relationships.bestPartner));
  assert.equal(firstRank(relationships.bestPartner)?.user.id, highWinPartner.id);
  assert.equal(firstRank(relationships.bestPartner)?.ratingNetChange, 0.02);
  assert.ok(firstRank(relationships.worstPartner));
  assert.equal(firstRank(relationships.worstPartner)?.user.id, highLossPartner.id);
  assert.equal(firstRank(relationships.worstPartner)?.ratingNetChange, -0.02);
  assert.ok(firstRank(relationships.bestPartnerByRating));
  assert.equal(firstRank(relationships.bestPartnerByRating)?.user.id, netBestPartner.id);
  assert.equal(firstRank(relationships.bestPartnerByRating)?.ratingNetChange, 0.08);
  assert.ok(firstRank(relationships.worstPartnerByRating));
  assert.equal(firstRank(relationships.worstPartnerByRating)?.user.id, netWorstPartner.id);
  assert.equal(firstRank(relationships.worstPartnerByRating)?.ratingNetChange, -0.08);
})();

(() => {
  const current = user('u-current', 'Current');
  const strongPartner = user('u-strong-partner', 'Strong');
  const weakPartner = user('u-weak-partner', 'Weak');
  const favoriteTarget = user('u-target', 'Target');
  const nemesis = user('u-nemesis', 'Nemesis');
  const otherOpponent = user('u-other-opponent', 'Other');
  const oneVsOneOpponent = user('u-one-v-one', 'Singles');
  const volumePartner = user('u-volume-partner', 'Volume');

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-current-1', [
        team('team-current-1', [current, strongPartner]),
        team('team-target-1', [favoriteTarget, otherOpponent]),
      ]),
      match('team-current-2', [
        team('team-current-2', [current, strongPartner]),
        team('team-target-2', [favoriteTarget, nemesis]),
      ]),
      match('team-nemesis-1', [
        team('team-current-3', [current, weakPartner]),
        team('team-nemesis-1', [nemesis, otherOpponent]),
      ]),
      match('team-nemesis-2', [
        team('team-current-4', [current, weakPartner]),
        team('team-nemesis-2', [nemesis, favoriteTarget]),
      ]),
      match(null, [
        team('team-current-5', [current, weakPartner]),
        team('team-tie-1', [favoriteTarget, otherOpponent]),
      ]),
      match('team-current-singles', [
        team('team-current-singles', [current]),
        team('team-opponent-singles', [oneVsOneOpponent]),
      ]),
      match('team-current-6', [
        team('team-current-6', [current, volumePartner]),
        team('team-volume-opponent-1', [favoriteTarget, otherOpponent]),
      ]),
      match('team-volume-opponent-2', [
        team('team-current-7', [current, volumePartner]),
        team('team-volume-opponent-2', [nemesis, otherOpponent]),
      ]),
      match('team-volume-opponent-3', [
        team('team-current-8', [current, volumePartner]),
        team('team-volume-opponent-3', [nemesis, favoriteTarget]),
      ]),
      match('team-volume-opponent-4', [
        team('team-current-9', [current, volumePartner]),
        team('team-volume-opponent-4', [oneVsOneOpponent, otherOpponent]),
      ]),
    ],
    Sport.PADEL,
  );

  assert.ok(firstRank(relationships.bestPartner));
  assert.equal(firstRank(relationships.bestPartner)?.user.id, strongPartner.id);
  assert.equal(firstRank(relationships.bestPartner)?.wins, 2);
  assert.equal(firstRank(relationships.bestPartner)?.losses, 0);
  assert.ok(firstRank(relationships.worstPartner));
  assert.equal(firstRank(relationships.worstPartner)?.user.id, volumePartner.id);
  assert.equal(firstRank(relationships.worstPartner)?.wins, 1);
  assert.equal(firstRank(relationships.worstPartner)?.losses, 3);
  assert.equal(firstRank(relationships.worstPartner)?.ties, 0);
  assert.ok(firstRank(relationships.bestPartnerByCount));
  assert.equal(firstRank(relationships.bestPartnerByCount)?.user.id, strongPartner.id);
  assert.ok(firstRank(relationships.worstPartnerByCount));
  assert.equal(firstRank(relationships.worstPartnerByCount)?.user.id, volumePartner.id);

  assert.ok(firstRank(relationships.favoriteTarget));
  assert.equal(firstRank(relationships.favoriteTarget)?.user.id, favoriteTarget.id);
  assert.equal(firstRank(relationships.favoriteTarget)?.wins, 3);
  assert.equal(firstRank(relationships.favoriteTarget)?.losses, 2);
  assert.equal(firstRank(relationships.favoriteTarget)?.ties, 1);
  assert.ok(firstRank(relationships.nemesis));
  assert.equal(firstRank(relationships.nemesis)?.user.id, nemesis.id);
  assert.equal(firstRank(relationships.nemesis)?.losses, 4);
  assert.equal(firstRank(relationships.nemesis)?.wins, 1);
  assert.equal(firstRank(relationships.nemesis)?.ties, 0);
  assert.ok(firstRank(relationships.favoriteTargetByCount));
  assert.equal(firstRank(relationships.favoriteTargetByCount)?.user.id, favoriteTarget.id);
  assert.ok(firstRank(relationships.nemesisByCount));
  assert.equal(firstRank(relationships.nemesisByCount)?.user.id, nemesis.id);
})();

(() => {
  const current = user('u-current', 'Current');
  const frequentWinOpponent = user('u-frequent-win-opponent', 'FrequentWin');
  const frequentLossOpponent = user('u-frequent-loss-opponent', 'FrequentLoss');

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-current-win-1', [
        team('team-current-win-1', [current]),
        team('team-frequent-win-1', [frequentWinOpponent]),
      ]),
      match('team-current-win-2', [
        team('team-current-win-2', [current]),
        team('team-frequent-win-2', [frequentWinOpponent]),
      ]),
      match('team-current-win-3', [
        team('team-current-win-3', [current]),
        team('team-frequent-win-3', [frequentWinOpponent]),
      ]),
      match('team-frequent-loss-1', [
        team('team-current-loss-1', [current]),
        team('team-frequent-loss-1', [frequentLossOpponent]),
      ]),
      match('team-frequent-loss-2', [
        team('team-current-loss-2', [current]),
        team('team-frequent-loss-2', [frequentLossOpponent]),
      ]),
      match('team-frequent-loss-3', [
        team('team-current-loss-3', [current]),
        team('team-frequent-loss-3', [frequentLossOpponent]),
      ]),
    ],
    Sport.PADEL,
  );

  assert.ok(firstRank(relationships.favoriteTarget));
  assert.equal(firstRank(relationships.favoriteTarget)?.user.id, frequentWinOpponent.id);
  assert.equal(firstRank(relationships.favoriteTarget)?.wins, 3);
  assert.equal(firstRank(relationships.favoriteTarget)?.losses, 0);
  assert.ok(firstRank(relationships.nemesis));
  assert.equal(firstRank(relationships.nemesis)?.user.id, frequentLossOpponent.id);
  assert.equal(firstRank(relationships.nemesis)?.wins, 0);
  assert.equal(firstRank(relationships.nemesis)?.losses, 3);
})();

(() => {
  const current = user('u-current', 'Current');
  const partner = user('u-partner', 'Partner');
  const doublesOpponentA = user('u-doubles-a', 'DoublesA');
  const doublesOpponentB = user('u-doubles-b', 'DoublesB');
  const singlesTarget = user('u-singles-target', 'SinglesTarget');

  const oldPartnerGame = relationshipGame('g-old-partner', 1);
  const newPartnerGame = relationshipGame('g-new-partner', 3);
  const singlesGameA = relationshipGame('g-singles-a', 4);
  const singlesGameB = relationshipGame('g-singles-b', 5);
  const singlesGameC = relationshipGame('g-singles-c', 6);
  const singlesGameD = relationshipGame('g-singles-d', 7);

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-current-old-1', [
        team('team-current-old-1', [current, partner]),
        team('team-doubles-old-1', [doublesOpponentA, doublesOpponentB]),
      ], 0.02, oldPartnerGame),
      match('team-current-old-2', [
        team('team-current-old-2', [current, partner]),
        team('team-doubles-old-2', [doublesOpponentA, doublesOpponentB]),
      ], 0.01, oldPartnerGame),
      match('team-current-new', [
        team('team-current-new', [current, partner]),
        team('team-doubles-new', [doublesOpponentA, doublesOpponentB]),
      ], 0.03, newPartnerGame),
      match('team-current-singles-a', [
        team('team-current-singles-a', [current]),
        team('team-singles-target-a', [singlesTarget]),
      ], 0.01, singlesGameA),
      match('team-current-singles-b', [
        team('team-current-singles-b', [current]),
        team('team-singles-target-b', [singlesTarget]),
      ], 0.01, singlesGameB),
      match('team-current-singles-c', [
        team('team-current-singles-c', [current]),
        team('team-singles-target-c', [singlesTarget]),
      ], 0.01, singlesGameC),
      match('team-current-singles-d', [
        team('team-current-singles-d', [current]),
        team('team-singles-target-d', [singlesTarget]),
      ], 0.01, singlesGameD),
    ],
    Sport.PADEL,
  );

  assert.ok(firstRank(relationships.bestPartner));
  assert.equal(firstRank(relationships.bestPartner)?.user.id, partner.id);
  assert.deepEqual(
    firstRank(relationships.bestPartner)?.games.map((game) => game.id),
    [newPartnerGame.id, oldPartnerGame.id],
  );

  assert.ok(firstRank(relationships.favoriteTarget));
  assert.equal(firstRank(relationships.favoriteTarget)?.user.id, singlesTarget.id);
  assert.deepEqual(
    firstRank(relationships.favoriteTarget)?.games.map((game) => game.id),
    [singlesGameD.id, singlesGameC.id, singlesGameB.id, singlesGameA.id],
  );
  assert.equal(
    firstRank(relationships.bestPartner)?.games.some((game) => game.id === singlesGameA.id),
    false,
  );
})();

(() => {
  const current = user('u-current', 'Current');
  const highImpactTarget = user('u-high-impact-target', 'ImpactTarget');
  const steadyTarget = user('u-steady-target', 'SteadyTarget');
  const highImpactNemesis = user('u-high-impact-nemesis', 'ImpactNemesis');
  const steadyNemesis = user('u-steady-nemesis', 'SteadyNemesis');

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-current-steady-target-1', [
        team('team-current-steady-target-1', [current]),
        team('team-steady-target-1', [steadyTarget]),
      ], 0.01),
      match('team-current-steady-target-2', [
        team('team-current-steady-target-2', [current]),
        team('team-steady-target-2', [steadyTarget]),
      ], 0.01),
      match('team-current-impact-target-1', [
        team('team-current-impact-target-1', [current]),
        team('team-impact-target-1', [highImpactTarget]),
      ], 0.08),
      match(null, [
        team('team-current-impact-target-2', [current]),
        team('team-impact-target-2', [highImpactTarget]),
      ], 0.08),
      match('team-steady-nemesis-1', [
        team('team-current-steady-nemesis-1', [current]),
        team('team-steady-nemesis-1', [steadyNemesis]),
      ], -0.01),
      match('team-steady-nemesis-2', [
        team('team-current-steady-nemesis-2', [current]),
        team('team-steady-nemesis-2', [steadyNemesis]),
      ], -0.01),
      match('team-impact-nemesis-1', [
        team('team-current-impact-nemesis-1', [current]),
        team('team-impact-nemesis-1', [highImpactNemesis]),
      ], -0.08),
      match(null, [
        team('team-current-impact-nemesis-2', [current]),
        team('team-impact-nemesis-2', [highImpactNemesis]),
      ], -0.08),
    ],
    Sport.PADEL,
  );

  assert.ok(firstRank(relationships.favoriteTarget));
  assert.equal(firstRank(relationships.favoriteTarget)?.user.id, highImpactTarget.id);
  assert.equal(firstRank(relationships.favoriteTarget)?.ratingNetChange, 0.16);
  assert.ok(firstRank(relationships.favoriteTargetByRating));
  assert.equal(firstRank(relationships.favoriteTargetByRating)?.user.id, highImpactTarget.id);
  assert.ok(firstRank(relationships.favoriteTargetByCount));
  assert.equal(firstRank(relationships.favoriteTargetByCount)?.user.id, steadyTarget.id);
  assert.ok(firstRank(relationships.nemesis));
  assert.equal(firstRank(relationships.nemesis)?.user.id, highImpactNemesis.id);
  assert.equal(firstRank(relationships.nemesis)?.ratingNetChange, -0.16);
  assert.ok(firstRank(relationships.nemesisByRating));
  assert.equal(firstRank(relationships.nemesisByRating)?.user.id, highImpactNemesis.id);
  assert.ok(firstRank(relationships.nemesisByCount));
  assert.equal(firstRank(relationships.nemesisByCount)?.user.id, steadyNemesis.id);
})();

(() => {
  const current = user('u-current', 'Current');
  const opponent = user('u-opponent', 'Opponent');
  const third = user('u-third', 'Third');
  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-opponent', [
        team('team-current', [current]),
        team('team-opponent', [opponent, third]),
      ]),
    ],
    Sport.PADEL,
  );

  assert.deepEqual(relationships.favoriteTarget, []);
  assert.deepEqual(relationships.nemesis, []);
})();

(() => {
  const current = user('u-current', 'Current');
  const twelveWin = user('u-twelve', 'Twelve');
  const elevenWin = user('u-eleven', 'Eleven');
  const tenWin = user('u-ten', 'Ten');
  const eightLoss = user('u-eight-loss', 'EightLoss');
  const fiveLoss = user('u-five-loss', 'FiveLoss');
  const threeLoss = user('u-three-loss', 'ThreeLoss');
  const extraPartner = user('u-extra', 'Extra');
  const oppA = user('u-opp-a', 'OppA');
  const oppB = user('u-opp-b', 'OppB');
  const opponents: [ReturnType<typeof user>, ReturnType<typeof user>] = [oppA, oppB];

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      ...winsWith(current, twelveWin, opponents, 12, 'twelve'),
      ...winsWith(current, elevenWin, opponents, 11, 'eleven'),
      ...winsWith(current, tenWin, opponents, 10, 'ten'),
      ...winsWith(current, extraPartner, opponents, 4, 'extra'),
      ...lossesWith(current, eightLoss, opponents, 8, 'eight'),
      ...lossesWith(current, fiveLoss, opponents, 5, 'five'),
      ...lossesWith(current, threeLoss, opponents, 3, 'three'),
    ],
    Sport.PADEL,
  );

  assert.deepEqual(rankIds(relationships.bestPartnerByCount), [twelveWin.id, elevenWin.id, tenWin.id]);
  assert.equal(relationships.bestPartnerByCount[0]?.wins, 12);
  assert.equal(relationships.bestPartnerByCount[1]?.wins, 11);
  assert.equal(relationships.bestPartnerByCount[2]?.wins, 10);
  assert.deepEqual(rankIds(relationships.worstPartnerByCount), [eightLoss.id, fiveLoss.id, threeLoss.id]);
  assert.equal(relationships.worstPartnerByCount[0]?.losses, 8);
  assert.equal(relationships.worstPartnerByCount[1]?.losses, 5);
  assert.equal(relationships.worstPartnerByCount[2]?.losses, 3);
})();

(() => {
  const current = user('u-current', 'Current');
  const targetTwelve = user('u-target-twelve', 'TargetTwelve');
  const targetEleven = user('u-target-eleven', 'TargetEleven');
  const targetTen = user('u-target-ten', 'TargetTen');
  const nemesisEight = user('u-nemesis-eight', 'NemesisEight');
  const nemesisFive = user('u-nemesis-five', 'NemesisFive');
  const nemesisThree = user('u-nemesis-three', 'NemesisThree');

  const singles = (
    opponent: ReturnType<typeof user>,
    count: number,
    prefix: string,
    userWins: boolean,
  ) => Array.from({ length: count }, (_, index) => match(
    userWins ? `${prefix}-us-${index}` : `${prefix}-them-${index}`,
    [
      team(`${prefix}-us-${index}`, [current]),
      team(`${prefix}-them-${index}`, [opponent]),
    ],
  ));

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      ...singles(targetTwelve, 12, 't12', true),
      ...singles(targetEleven, 11, 't11', true),
      ...singles(targetTen, 10, 't10', true),
      ...singles(nemesisEight, 8, 'n8', false),
      ...singles(nemesisFive, 5, 'n5', false),
      ...singles(nemesisThree, 3, 'n3', false),
    ],
    Sport.PADEL,
  );

  assert.deepEqual(rankIds(relationships.favoriteTargetByCount), [targetTwelve.id, targetEleven.id, targetTen.id]);
  assert.deepEqual(rankIds(relationships.nemesisByCount), [nemesisEight.id, nemesisFive.id, nemesisThree.id]);
})();

(() => {
  const current = user('u-current', 'Current');
  const confident = user('u-confident', 'Confident');
  const oneOffB = user('u-one-off-b', 'OneOffB');
  const oneOffC = user('u-one-off-c', 'OneOffC');
  const oppA = user('u-opp-a', 'OppA');
  const oppB = user('u-opp-b', 'OppB');
  const opponents: [ReturnType<typeof user>, ReturnType<typeof user>] = [oppA, oppB];

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      ...winsWith(current, confident, opponents, 2, 'confident'),
      ...winsWith(current, oneOffB, opponents, 1, 'one-b'),
      ...winsWith(current, oneOffC, opponents, 1, 'one-c'),
    ],
    Sport.PADEL,
  );

  assert.equal(firstRank(relationships.bestPartner)?.user.id, confident.id);
  assert.equal(relationships.bestPartner.length, 3);
  assert.deepEqual(new Set(rankIds(relationships.bestPartner)), new Set([confident.id, oneOffB.id, oneOffC.id]));
})();

console.log('userPerformanceInsights.service tests passed');
