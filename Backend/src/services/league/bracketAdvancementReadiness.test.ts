import assert from 'node:assert/strict';
import {
  BracketSlotKind,
  EntityType,
  ResultsStatus,
  RoundType,
  type Prisma,
} from '@prisma/client';
import {
  BracketAdvancementService,
  resolveBracketFixtureAffectsRating,
} from './bracketAdvancement.service';
import {
  shouldCascadeBracketOutcomesUndo,
  shouldRebuildLeagueStandingsForGame,
} from '../results/outcomeRecalculationPolicy';

async function run(): Promise<void> {
  assert.equal(
    resolveBracketFixtureAffectsRating({ affectsRating: true }),
    true,
    'rated league seasons must create rated bracket fixtures',
  );
  assert.equal(
    resolveBracketFixtureAffectsRating({ affectsRating: false }),
    false,
    'bracket fixtures inherit an explicitly non-rating league season',
  );
  assert.equal(
    resolveBracketFixtureAffectsRating({}),
    true,
    'legacy league seasons default bracket fixtures to rated',
  );

  assert.equal(
    shouldCascadeBracketOutcomesUndo({
      resultsStatus: ResultsStatus.FINAL,
      hasBracketSlot: true,
      preserveBracketStructure: false,
    }),
    true,
    'ordinary result edits must continue invalidating downstream bracket games',
  );
  assert.equal(
    shouldCascadeBracketOutcomesUndo({
      resultsStatus: ResultsStatus.FINAL,
      hasBracketSlot: true,
      preserveBracketStructure: true,
    }),
    false,
    'rating-only recalculation must preserve downstream bracket games',
  );
  assert.equal(
    shouldRebuildLeagueStandingsForGame({
      entityType: EntityType.LEAGUE,
      parentId: 'season-1',
      roundType: RoundType.PLAYOFF,
    }),
    false,
    'playoff outcome recalculation must not rebuild regular-season standings',
  );
  assert.equal(
    shouldRebuildLeagueStandingsForGame({
      entityType: EntityType.LEAGUE,
      parentId: 'season-1',
      roundType: RoundType.REGULAR,
    }),
    true,
    'regular league fixtures must continue rebuilding standings',
  );

  const targetKinds = [
    BracketSlotKind.MAIN,
    BracketSlotKind.THIRD_PLACE,
    BracketSlotKind.CONSOLATION,
    BracketSlotKind.LOSERS,
    BracketSlotKind.GRAND_FINAL,
  ];
  const unresolvedFeeders = [
    {
      id: 'semi-without-game',
      slotKind: BracketSlotKind.MAIN,
      leagueParticipantId: 'temporary-quarterfinal-winner',
      gameId: null,
      game: null,
    },
    {
      id: 'semi-announced',
      slotKind: BracketSlotKind.MAIN,
      leagueParticipantId: 'temporary-quarterfinal-winner',
      gameId: 'semi-announced-game',
      game: { resultsStatus: ResultsStatus.NONE },
    },
    {
      id: 'semi-in-progress',
      slotKind: BracketSlotKind.MAIN,
      leagueParticipantId: 'temporary-quarterfinal-winner',
      gameId: 'semi-in-progress-game',
      game: { resultsStatus: ResultsStatus.IN_PROGRESS },
    },
  ];

  for (const feeder of unresolvedFeeders) {
    for (const targetKind of targetKinds) {
      const participantId = await BracketAdvancementService.participantIdFromFeeder(
        feeder,
        {} as Prisma.TransactionClient,
        targetKind,
      );
      assert.equal(
        participantId,
        null,
        `${targetKind} must wait until non-BYE feeder ${feeder.id} is FINAL`,
      );
    }
  }

  const byeParticipantId = await BracketAdvancementService.participantIdFromFeeder(
    {
      id: 'bye-1',
      slotKind: BracketSlotKind.BYE,
      leagueParticipantId: 'bye-participant',
      gameId: null,
      game: null,
    },
    {} as Prisma.TransactionClient,
    BracketSlotKind.MAIN,
  );

  assert.equal(
    byeParticipantId,
    'bye-participant',
    'a BYE remains the only feeder that can advance without a FINAL game',
  );

  const originalWinnerResolver = BracketAdvancementService.resolveWinnerParticipantId;
  const originalLoserResolver = BracketAdvancementService.resolveLoserParticipantId;
  BracketAdvancementService.resolveWinnerParticipantId = async (gameId) => `winner:${gameId}`;
  BracketAdvancementService.resolveLoserParticipantId = async (gameId) => `loser:${gameId}`;
  try {
    const finalMainFeeder = {
      id: 'completed-main',
      slotKind: BracketSlotKind.MAIN,
      leagueParticipantId: 'stale-cache-must-not-win',
      gameId: 'completed-main-game',
      game: { resultsStatus: ResultsStatus.FINAL },
    };
    const finalConsolationFeeder = {
      ...finalMainFeeder,
      id: 'completed-consolation',
      slotKind: BracketSlotKind.CONSOLATION,
      gameId: 'completed-consolation-game',
    };

    assert.equal(
      await BracketAdvancementService.participantIdFromFeeder(
        finalMainFeeder,
        {} as Prisma.TransactionClient,
        BracketSlotKind.MAIN,
      ),
      'winner:completed-main-game',
    );
    assert.equal(
      await BracketAdvancementService.participantIdFromFeeder(
        finalMainFeeder,
        {} as Prisma.TransactionClient,
        BracketSlotKind.THIRD_PLACE,
      ),
      'loser:completed-main-game',
    );
    assert.equal(
      await BracketAdvancementService.participantIdFromFeeder(
        finalMainFeeder,
        {} as Prisma.TransactionClient,
        BracketSlotKind.CONSOLATION,
      ),
      'loser:completed-main-game',
    );
    assert.equal(
      await BracketAdvancementService.participantIdFromFeeder(
        finalMainFeeder,
        {} as Prisma.TransactionClient,
        BracketSlotKind.LOSERS,
      ),
      'loser:completed-main-game',
    );
    assert.equal(
      await BracketAdvancementService.participantIdFromFeeder(
        finalMainFeeder,
        {} as Prisma.TransactionClient,
        BracketSlotKind.GRAND_FINAL,
      ),
      'winner:completed-main-game',
    );
    assert.equal(
      await BracketAdvancementService.participantIdFromFeeder(
        finalConsolationFeeder,
        {} as Prisma.TransactionClient,
        BracketSlotKind.CONSOLATION,
      ),
      'winner:completed-consolation-game',
    );
  } finally {
    BracketAdvancementService.resolveWinnerParticipantId = originalWinnerResolver;
    BracketAdvancementService.resolveLoserParticipantId = originalLoserResolver;
  }

  const lockOrder: string[] = [];
  await BracketAdvancementService.tryCreateReadyGames(
    'round-1',
    'group-1',
    {
      $queryRaw: async () => {
        lockOrder.push('round-lock');
        return [];
      },
      leagueRound: {
        findUnique: async () => {
          lockOrder.push('round-read');
          return null;
        },
      },
    } as unknown as Prisma.TransactionClient,
  );
  assert.deepEqual(
    lockOrder,
    ['round-lock', 'round-read'],
    'ready-game creation must serialize the bracket round before checking feeder readiness',
  );

  const fixedTeams = [
    {
      teamNumber: 1,
      players: [{ userId: 'a1' }, { userId: 'a2' }],
    },
    {
      teamNumber: 2,
      players: [{ userId: 'b1' }, { userId: 'b2' }],
    },
  ];
  const participants = [
    {
      id: 'participant-a',
      leagueTeamId: 'team-a',
      currentGroupId: null,
      leagueTeam: { id: 'team-a', players: [{ userId: 'a1' }, { userId: 'a2' }] },
    },
    {
      id: 'participant-b',
      leagueTeamId: 'team-b',
      currentGroupId: null,
      leagueTeam: { id: 'team-b', players: [{ userId: 'b1' }, { userId: 'b2' }] },
    },
  ];
  const winnerTx = (outcomes: Array<{ userId: string; wins: number; isWinner: boolean }>) =>
    ({
      game: {
        findUnique: async () => ({
          parentId: 'season-1',
          resultsStatus: ResultsStatus.FINAL,
          fixedTeams,
          outcomes,
        }),
      },
      leagueParticipant: {
        findMany: async () => participants,
      },
    }) as unknown as Prisma.TransactionClient;

  assert.equal(
    await BracketAdvancementService.resolveWinnerParticipantId(
      'ambiguous-final',
      winnerTx([
        { userId: 'a1', wins: 1, isWinner: false },
        { userId: 'a2', wins: 1, isWinner: false },
        { userId: 'b1', wins: 1, isWinner: false },
        { userId: 'b2', wins: 1, isWinner: false },
      ]),
    ),
    null,
    'a tied FINAL outcome must not advance an arbitrary team',
  );
  assert.equal(
    await BracketAdvancementService.resolveWinnerParticipantId(
      'conflicting-final',
      winnerTx([
        { userId: 'a1', wins: 1, isWinner: true },
        { userId: 'a2', wins: 1, isWinner: true },
        { userId: 'b1', wins: 0, isWinner: true },
        { userId: 'b2', wins: 0, isWinner: true },
      ]),
    ),
    null,
    'conflicting explicit winners must not advance either team',
  );
  assert.equal(
    await BracketAdvancementService.resolveWinnerParticipantId(
      'unique-final',
      winnerTx([
        { userId: 'a1', wins: 2, isWinner: false },
        { userId: 'a2', wins: 2, isWinner: false },
        { userId: 'b1', wins: 1, isWinner: false },
        { userId: 'b2', wins: 1, isWinner: false },
      ]),
    ),
    'participant-a',
    'a unique fallback win total remains a valid winner proof',
  );
}

run()
  .then(() => console.log('bracketAdvancementReadiness tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
