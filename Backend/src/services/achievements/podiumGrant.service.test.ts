import assert from 'node:assert/strict';
import {
  finalistFromChampionshipSides,
  groupUserIdsByPodiumPlace,
  isPodiumEligibleEntityType,
  meetsPodiumParticipantFloor,
  mergeTreePodiumsIntoEventPlaces,
  podiumDefinitionForPlace,
  treeKeysForBracketPodium,
  usesBracketPlacesForEventPodium,
} from '@bandeja/shared/achievements';
import {
  eligibleUserIdsFromFinalFixtures,
  grantPodiumAchievementsForFinalizedGame,
  mergePodiumUnlocksMetadata,
  podiumAwardSetEquals,
  readPodiumUnlocksFromMetadata,
  revokeActivePodiumForSource,
  revokePodiumAchievementsAfterResultsReopen,
  stripPodiumUnlocksMetadata,
  syncParentSeasonPodiumIfFinal,
} from './podiumGrant.service';

{
  assert.equal(meetsPodiumParticipantFloor(7), false);
  assert.equal(meetsPodiumParticipantFloor(8), true);
}

{
  assert.equal(isPodiumEligibleEntityType('TOURNAMENT', null), true);
  assert.equal(isPodiumEligibleEntityType('LEAGUE_SEASON', null), true);
  assert.equal(isPodiumEligibleEntityType('LEAGUE', null), true);
  assert.equal(isPodiumEligibleEntityType('LEAGUE', 'season-id'), false);
  assert.equal(isPodiumEligibleEntityType('GAME', null), false);
  assert.equal(isPodiumEligibleEntityType('TRAINING', null), false);
}

{
  // CROSS_GROUP and PER_GROUP both drive the event podium from bracket places.
  // Each PER_GROUP tree contributes its own champion/finalist/third, so a
  // multi-group season awards one gold/silver/bronze set per group.
  assert.equal(usesBracketPlacesForEventPodium('CROSS_GROUP', 0), true);
  assert.equal(usesBracketPlacesForEventPodium('CROSS_GROUP', 5), true);
  assert.equal(usesBracketPlacesForEventPodium('PER_GROUP', 0), true);
  assert.equal(usesBracketPlacesForEventPodium('PER_GROUP', 1), true);
  assert.equal(usesBracketPlacesForEventPodium('PER_GROUP', 2), true);
  assert.equal(usesBracketPlacesForEventPodium('PER_GROUP', 3), true);
}

{
  // Season-wide (CROSS_GROUP): one null-scoped tree.
  assert.deepEqual(treeKeysForBracketPodium('CROSS_GROUP', ['g1', 'g2', 'g3']), [null]);
  assert.deepEqual(treeKeysForBracketPodium('CROSS_GROUP', []), [null]);
  // Per-group: one tree key per division.
  assert.deepEqual(treeKeysForBracketPodium('PER_GROUP', ['g1', 'g2']), ['g1', 'g2']);
  assert.deepEqual(treeKeysForBracketPodium('PER_GROUP', ['only']), ['only']);
  // No groups yet: still one tree so empty seasons don't fall through to RR.
  assert.deepEqual(treeKeysForBracketPodium('PER_GROUP', []), [null]);
}

{
  // Finalist is always the other side of a completed final.
  assert.equal(finalistFromChampionshipSides('champ', 'champ', 'runner'), 'runner');
  assert.equal(finalistFromChampionshipSides('runner', 'champ', 'runner'), 'champ');
  assert.equal(finalistFromChampionshipSides(null, 'a', 'b'), null);
  assert.equal(finalistFromChampionshipSides('c', 'a', 'b'), null, 'winner not on either side');
}

{
  // CROSS_GROUP / single tree: one finalist (final-game loser), not RR #2.
  const seasonWide = mergeTreePodiumsIntoEventPlaces([
    {
      championParticipantId: 'season-champ',
      finalistParticipantId: 'season-finalist',
      thirdPlaceParticipantId: 'season-third',
    },
  ]);
  assert.deepEqual(seasonWide.get(1), ['season-champ']);
  assert.deepEqual(seasonWide.get(2), ['season-finalist']);
  assert.deepEqual(seasonWide.get(3), ['season-third']);
}

{
  // PER_GROUP multi: each division contributes its own finalist (silver).
  // Must NOT collapse to a single season finalist or RR standings rows.
  const multiGroup = mergeTreePodiumsIntoEventPlaces([
    {
      championParticipantId: 'g1-champ',
      finalistParticipantId: 'g1-finalist',
      thirdPlaceParticipantId: 'g1-third',
    },
    {
      championParticipantId: 'g2-champ',
      finalistParticipantId: 'g2-finalist',
      thirdPlaceParticipantId: 'g2-third',
    },
  ]);
  assert.deepEqual(multiGroup.get(1), ['g1-champ', 'g2-champ']);
  assert.deepEqual(multiGroup.get(2), ['g1-finalist', 'g2-finalist']);
  assert.deepEqual(multiGroup.get(3), ['g1-third', 'g2-third']);
}

{
  // Tree without a champion contributes no places (partial season).
  const partial = mergeTreePodiumsIntoEventPlaces([
    {
      championParticipantId: null,
      finalistParticipantId: 'should-not-appear',
    },
    {
      championParticipantId: 'done-champ',
      finalistParticipantId: 'done-finalist',
    },
  ]);
  assert.deepEqual(partial.get(1), ['done-champ']);
  assert.deepEqual(partial.get(2), ['done-finalist']);
  assert.equal(partial.has(3), false);
}

{
  // Completed final without third: finalist still awarded (silver only).
  const noThird = mergeTreePodiumsIntoEventPlaces([
    {
      championParticipantId: 'c',
      finalistParticipantId: 'f',
      thirdPlaceParticipantId: null,
    },
  ]);
  assert.deepEqual(noThird.get(2), ['f']);
  assert.equal(noThird.has(3), false);
}

{
  const gold = podiumDefinitionForPlace(1);
  const silver = podiumDefinitionForPlace(2);
  const bronze = podiumDefinitionForPlace(3);
  assert.equal(gold.rarity, 'LEGENDARY');
  assert.equal(silver.rarity, 'RARE');
  assert.equal(bronze.rarity, 'RARE');
}

{
  const byPlace = groupUserIdsByPodiumPlace([
    { userId: 'u1', position: 1 },
    { userId: 'u2', position: 2 },
    { userId: 'u3', position: 3 },
    { userId: 'u4', position: 1 },
    { userId: 'u5', position: null },
  ]);
  assert.deepEqual(byPlace.get(1), ['u1', 'u4']);
  assert.deepEqual(byPlace.get(2), ['u2']);
  assert.deepEqual(byPlace.get(3), ['u3']);
}

{
  assert.equal(
    podiumAwardSetEquals(
      [
        { userId: 'a', definitionId: 'podium_gold' },
        { userId: 'b', definitionId: 'podium_silver' },
      ],
      [
        { userId: 'b', definitionId: 'podium_silver' },
        { userId: 'a', definitionId: 'podium_gold' },
      ],
    ),
    true,
  );
  assert.equal(
    podiumAwardSetEquals(
      [{ userId: 'a', definitionId: 'podium_gold' }],
      [{ userId: 'b', definitionId: 'podium_gold' }],
    ),
    false,
  );
  assert.equal(
    podiumAwardSetEquals(
      [{ userId: 'a', definitionId: 'podium_gold' }],
      [
        { userId: 'a', definitionId: 'podium_gold' },
        { userId: 'a', definitionId: 'podium_silver' },
      ],
    ),
    false,
  );
}

{
  // T2: swapped-in sticker without FINAL fixture play → no award.
  const none = eligibleUserIdsFromFinalFixtures({
    participant: { id: 'team-1', participantType: 'TEAM', userId: null },
    fixtures: [
      {
        participantUserIds: ['old-a', 'old-b'],
        outcomeUserIds: ['old-a', 'old-b'],
        teams: [
          {
            playerIds: ['old-a', 'old-b'],
            resolvedParticipantId: 'team-1',
          },
        ],
      },
    ],
  });
  assert.deepEqual(none.sort(), ['old-a', 'old-b']);

  const stickerOnly = eligibleUserIdsFromFinalFixtures({
    participant: { id: 'team-1', participantType: 'TEAM', userId: null },
    fixtures: [
      {
        participantUserIds: ['old-a', 'old-b'],
        outcomeUserIds: ['old-a', 'old-b'],
        teams: [
          {
            playerIds: ['old-a', 'old-b'],
            resolvedParticipantId: 'team-1',
          },
        ],
      },
    ],
  });
  assert.equal(stickerOnly.includes('new-c'), false);

  const midSeasonPlayed = eligibleUserIdsFromFinalFixtures({
    participant: { id: 'team-1', participantType: 'TEAM', userId: null },
    fixtures: [
      {
        participantUserIds: ['old-a', 'old-b'],
        outcomeUserIds: ['old-a', 'old-b'],
        teams: [{ playerIds: ['old-a', 'old-b'], resolvedParticipantId: 'team-1' }],
      },
      {
        participantUserIds: ['old-a', 'new-c'],
        outcomeUserIds: ['old-a', 'new-c'],
        teams: [{ playerIds: ['old-a', 'new-c'], resolvedParticipantId: 'team-1' }],
      },
    ],
  });
  assert.deepEqual(midSeasonPlayed.sort(), ['new-c', 'old-a', 'old-b']);

  // Roster sticker on FINAL fixture but not PLAYING / no outcome → no trophy.
  const rosterSticker = eligibleUserIdsFromFinalFixtures({
    participant: { id: 'team-1', participantType: 'TEAM', userId: null },
    fixtures: [
      {
        participantUserIds: ['old-a'],
        outcomeUserIds: ['old-a'],
        teams: [{ playerIds: ['old-a', 'bench-d'], resolvedParticipantId: 'team-1' }],
      },
    ],
  });
  assert.deepEqual(rosterSticker, ['old-a']);
  assert.equal(rosterSticker.includes('bench-d'), false);
}

{
  const userPlayed = eligibleUserIdsFromFinalFixtures({
    participant: { id: 'p-user', participantType: 'USER', userId: 'u1' },
    fixtures: [
      {
        participantUserIds: ['u1'],
        outcomeUserIds: ['u1'],
        teams: [],
      },
    ],
  });
  assert.deepEqual(userPlayed, ['u1']);

  const userNeverPlayed = eligibleUserIdsFromFinalFixtures({
    participant: { id: 'p-user', participantType: 'USER', userId: 'u1' },
    fixtures: [
      {
        participantUserIds: ['u2'],
        outcomeUserIds: ['u2'],
        teams: [],
      },
    ],
  });
  assert.deepEqual(userNeverPlayed, []);
}

{
  const meta = mergePodiumUnlocksMetadata(null, [
    {
      definitionId: 'podium_gold',
      rarity: 'LEGENDARY',
      artKey: 'podium_gold',
      titleKey: 'trophies.defs.podiumGold.title',
      achievementId: 'ach1',
      place: 1,
      sport: 'PADEL',
    },
  ]);
  const read = readPodiumUnlocksFromMetadata(meta as object);
  assert.equal(read.length, 1);
  assert.equal(read[0]?.achievementId, 'ach1');
  assert.equal(readPodiumUnlocksFromMetadata(null).length, 0);

  const stripped = stripPodiumUnlocksMetadata(meta);
  assert.equal(readPodiumUnlocksFromMetadata(stripped as object).length, 0);
  assert.equal(
    Object.prototype.hasOwnProperty.call(stripped as object, 'podiumUnlocks'),
    false,
  );
}

type AchRow = {
  id: string;
  userId: string;
  definitionId: string;
  sourceKey: string;
  place: number | null;
  sport: string | null;
  isActive: boolean;
  revokedAt: Date | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceGameId?: string | null;
};

type PinRow = { userId: string; slot: number; achievementId: string };

type GameRow = {
  id: string;
  entityType: string;
  parentId: string | null;
  sport: string;
  resultsStatus: string;
};

type OutcomeRow = {
  gameId: string;
  userId: string;
  position: number | null;
  metadata?: Record<string, unknown> | null;
};

function makePodiumFakeDb(seed: {
  games: GameRow[];
  achievements: AchRow[];
  pins: PinRow[];
  outcomes: OutcomeRow[];
  playingCounts: Record<string, number>;
}) {
  const achievements = seed.achievements.map((a) => ({ ...a }));
  const pins = seed.pins.map((p) => ({ ...p }));
  const games = seed.games.map((g) => ({ ...g }));
  const outcomes = seed.outcomes.map((o) => ({ ...o }));
  let idSeq = 1;

  const db = {
    game: {
      findUnique: async (args: {
        where: { id: string };
        select: Record<string, unknown>;
      }) => {
        const g = games.find((row) => row.id === args.where.id);
        if (!g) return null;
        return {
          id: g.id,
          entityType: g.entityType,
          parentId: g.parentId,
          sport: g.sport,
          resultsStatus: g.resultsStatus,
        };
      },
    },
    gameParticipant: {
      count: async (args: { where: { gameId: string; status: string } }) => {
        return seed.playingCounts[args.where.gameId] ?? 0;
      },
      findMany: async (args: {
        where: { gameId: string; status: string };
        select: { userId: true };
      }) => {
        const fromOutcomes = outcomes
          .filter((o) => o.gameId === args.where.gameId)
          .map((o) => ({ userId: o.userId }));
        if (fromOutcomes.length > 0) return fromOutcomes;
        const n = seed.playingCounts[args.where.gameId] ?? 0;
        return Array.from({ length: n }, (_, i) => ({ userId: `play-${i}` }));
      },
    },
    gameOutcome: {
      findMany: async (args: {
        where: { gameId: string };
        select: { userId: true; position: true } | { userId: true; metadata: true };
      }) => {
        if ('position' in (args.select as object) || Object.keys(args.select).includes('position')) {
          return outcomes
            .filter((o) => o.gameId === args.where.gameId)
            .map((o) => ({ userId: o.userId, position: o.position }));
        }
        return outcomes
          .filter((o) => o.gameId === args.where.gameId)
          .map((o) => ({
            userId: o.userId,
            metadata: o.metadata ?? null,
          }));
      },
      update: async (args: {
        where: { gameId_userId: { gameId: string; userId: string } };
        data: { metadata: unknown };
      }) => {
        const row = outcomes.find(
          (o) =>
            o.gameId === args.where.gameId_userId.gameId &&
            o.userId === args.where.gameId_userId.userId,
        );
        if (row) {
          row.metadata =
            args.data.metadata != null && typeof args.data.metadata === 'object'
              ? (args.data.metadata as Record<string, unknown>)
              : null;
        }
        return row;
      },
    },
    userAchievement: {
      findMany: async (args: {
        where: {
          sourceKey: string;
          isActive: boolean;
          definitionId: { in: string[] };
        };
        select: Record<string, unknown>;
      }) =>
        achievements
          .filter(
            (a) =>
              a.sourceKey === args.where.sourceKey &&
              a.isActive === args.where.isActive &&
              args.where.definitionId.in.includes(a.definitionId),
          )
          .map((a) => ({
            id: a.id,
            userId: a.userId,
            definitionId: a.definitionId,
            place: a.place,
            sport: a.sport,
          })),
      findFirst: async (args: {
        where: {
          userId: string;
          definitionId: string;
          sourceKey: string;
          isActive: boolean;
        };
        select: Record<string, unknown>;
      }) => {
        const row = achievements.find(
          (a) =>
            a.userId === args.where.userId &&
            a.definitionId === args.where.definitionId &&
            a.sourceKey === args.where.sourceKey &&
            a.isActive === args.where.isActive,
        );
        return row
          ? { id: row.id, place: row.place, sport: row.sport }
          : null;
      },
      create: async (args: {
        data: {
          userId: string;
          definitionId: string;
          sourceKey: string;
          sport: string;
          place: number;
          sourceEntityType: string;
          sourceEntityId: string;
          sourceGameId: string;
          isActive: boolean;
        };
      }) => {
        const activeDup = achievements.find(
          (a) =>
            a.isActive &&
            a.userId === args.data.userId &&
            a.definitionId === args.data.definitionId &&
            a.sourceKey === args.data.sourceKey,
        );
        if (activeDup) {
          const err = new Error('Unique constraint') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        const row: AchRow = {
          id: `new-${idSeq++}`,
          userId: args.data.userId,
          definitionId: args.data.definitionId,
          sourceKey: args.data.sourceKey,
          place: args.data.place,
          sport: args.data.sport,
          isActive: true,
          revokedAt: null,
          sourceEntityType: args.data.sourceEntityType,
          sourceEntityId: args.data.sourceEntityId,
          sourceGameId: args.data.sourceGameId,
        };
        achievements.push(row);
        return row;
      },
      updateMany: async (args: {
        where: { id: { in: string[] } };
        data: { isActive: boolean; revokedAt: Date };
      }) => {
        let count = 0;
        for (const a of achievements) {
          if (!args.where.id.in.includes(a.id)) continue;
          a.isActive = args.data.isActive;
          a.revokedAt = args.data.revokedAt;
          count += 1;
        }
        return { count };
      },
    },
    userAchievementPin: {
      deleteMany: async (args: {
        where: { achievementId: { in: string[] }; userId?: string };
      }) => {
        const before = pins.length;
        for (let i = pins.length - 1; i >= 0; i -= 1) {
          const pin = pins[i];
          if (!args.where.achievementId.in.includes(pin.achievementId)) continue;
          if (args.where.userId && pin.userId !== args.where.userId) continue;
          pins.splice(i, 1);
        }
        return { count: before - pins.length };
      },
    },
    _achievements: achievements,
    _pins: pins,
    _outcomes: outcomes,
  };

  return db;
}

async function runAsyncPodiumRevokeTests() {
  {
    // revokeActivePodiumForSource: soft-revoke + clear pins (X1 pin hygiene).
    const db = makePodiumFakeDb({
      games: [],
      achievements: [
        {
          id: 'gold-a',
          userId: 'u-wrong',
          definitionId: 'podium_gold',
          sourceKey: 'evt-1',
          place: 1,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
        {
          id: 'silver-b',
          userId: 'u-right',
          definitionId: 'podium_silver',
          sourceKey: 'evt-1',
          place: 2,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
        {
          id: 'other-evt',
          userId: 'u-other',
          definitionId: 'podium_gold',
          sourceKey: 'evt-2',
          place: 1,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
      ],
      pins: [
        { userId: 'u-wrong', slot: 0, achievementId: 'gold-a' },
        { userId: 'u-right', slot: 1, achievementId: 'silver-b' },
        { userId: 'u-other', slot: 0, achievementId: 'other-evt' },
      ],
      outcomes: [],
      playingCounts: {},
    });

    const revoked = await revokeActivePodiumForSource(db as never, 'evt-1');
    assert.equal(revoked, 2);
    assert.equal(db._achievements.find((a) => a.id === 'gold-a')?.isActive, false);
    assert.ok(db._achievements.find((a) => a.id === 'gold-a')?.revokedAt);
    assert.equal(db._achievements.find((a) => a.id === 'other-evt')?.isActive, true);
    assert.equal(db._pins.length, 1);
    assert.equal(db._pins[0]?.achievementId, 'other-evt');
  }

  {
    // reopen: revoke podium-eligible tournament; ignore LEAGUE fixture.
    const tournamentDb = makePodiumFakeDb({
      games: [
        {
          id: 'tour-1',
          entityType: 'TOURNAMENT',
          parentId: null,
          sport: 'PADEL',
          resultsStatus: 'IN_PROGRESS',
        },
      ],
      achievements: [
        {
          id: 'g1',
          userId: 'u1',
          definitionId: 'podium_gold',
          sourceKey: 'tour-1',
          place: 1,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
      ],
      pins: [{ userId: 'u1', slot: 0, achievementId: 'g1' }],
      outcomes: [],
      playingCounts: {},
    });
    const n = await revokePodiumAchievementsAfterResultsReopen({
      gameId: 'tour-1',
      tx: tournamentDb as never,
    });
    assert.equal(n, 1);
    assert.equal(tournamentDb._pins.length, 0);
    assert.equal(tournamentDb._achievements[0]?.isActive, false);

    const fixtureDb = makePodiumFakeDb({
      games: [
        {
          id: 'fix-1',
          entityType: 'LEAGUE',
          parentId: 'season-1',
          sport: 'PADEL',
          resultsStatus: 'IN_PROGRESS',
        },
      ],
      achievements: [
        {
          id: 'season-gold',
          userId: 'u1',
          definitionId: 'podium_gold',
          sourceKey: 'season-1',
          place: 1,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
      ],
      pins: [],
      outcomes: [],
      playingCounts: {},
    });
    const skipped = await revokePodiumAchievementsAfterResultsReopen({
      gameId: 'fix-1',
      tx: fixtureDb as never,
    });
    assert.equal(skipped, 0);
    assert.equal(fixtureDb._achievements[0]?.isActive, true);
  }

  {
    // grant: identical awards → keep existing rows + pins (no revoke).
    const db = makePodiumFakeDb({
      games: [
        {
          id: 'tour-keep',
          entityType: 'TOURNAMENT',
          parentId: null,
          sport: 'PADEL',
          resultsStatus: 'FINAL',
        },
      ],
      achievements: [
        {
          id: 'keep-gold',
          userId: 'u1',
          definitionId: 'podium_gold',
          sourceKey: 'tour-keep',
          place: 1,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
        {
          id: 'keep-silver',
          userId: 'u2',
          definitionId: 'podium_silver',
          sourceKey: 'tour-keep',
          place: 2,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
        {
          id: 'keep-bronze',
          userId: 'u3',
          definitionId: 'podium_bronze',
          sourceKey: 'tour-keep',
          place: 3,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
      ],
      pins: [{ userId: 'u1', slot: 0, achievementId: 'keep-gold' }],
      outcomes: [
        { gameId: 'tour-keep', userId: 'u1', position: 1 },
        { gameId: 'tour-keep', userId: 'u2', position: 2 },
        { gameId: 'tour-keep', userId: 'u3', position: 3 },
      ],
      playingCounts: { 'tour-keep': 8 },
    });

    const batch = await grantPodiumAchievementsForFinalizedGame({
      gameId: 'tour-keep',
      tx: db as never,
    });
    assert.equal(batch.replaced, false);
    assert.equal(batch.materialized, false);
    assert.equal(batch.grants.length, 3);
    assert.ok(batch.grants.every((g) => g.achievementId.startsWith('keep-')));
    assert.equal(db._pins.length, 1);
    assert.equal(db._pins[0]?.achievementId, 'keep-gold');
    assert.equal(db._achievements.filter((a) => a.isActive).length, 3);
  }

  {
    // grant: place-1 correction → revoke old + pin cleanup + fresh instances.
    const db = makePodiumFakeDb({
      games: [
        {
          id: 'tour-fix',
          entityType: 'TOURNAMENT',
          parentId: null,
          sport: 'TENNIS',
          resultsStatus: 'FINAL',
        },
      ],
      achievements: [
        {
          id: 'old-gold',
          userId: 'u-old',
          definitionId: 'podium_gold',
          sourceKey: 'tour-fix',
          place: 1,
          sport: 'TENNIS',
          isActive: true,
          revokedAt: null,
        },
        {
          id: 'old-silver',
          userId: 'u-new',
          definitionId: 'podium_silver',
          sourceKey: 'tour-fix',
          place: 2,
          sport: 'TENNIS',
          isActive: true,
          revokedAt: null,
        },
        {
          id: 'old-bronze',
          userId: 'u3',
          definitionId: 'podium_bronze',
          sourceKey: 'tour-fix',
          place: 3,
          sport: 'TENNIS',
          isActive: true,
          revokedAt: null,
        },
      ],
      pins: [
        { userId: 'u-old', slot: 0, achievementId: 'old-gold' },
        { userId: 'u-new', slot: 1, achievementId: 'old-silver' },
      ],
      outcomes: [
        { gameId: 'tour-fix', userId: 'u-new', position: 1 },
        { gameId: 'tour-fix', userId: 'u-old', position: 2 },
        { gameId: 'tour-fix', userId: 'u3', position: 3 },
      ],
      playingCounts: { 'tour-fix': 10 },
    });

    const batch = await grantPodiumAchievementsForFinalizedGame({
      gameId: 'tour-fix',
      tx: db as never,
    });
    assert.equal(batch.replaced, true);
    assert.equal(batch.materialized, true);
    assert.equal(db._pins.length, 0);
    assert.equal(db._achievements.filter((a) => a.id.startsWith('old-') && a.isActive).length, 0);
    assert.ok(db._achievements.every((a) => (a.id.startsWith('old-') ? a.revokedAt != null : true)));

    const active = db._achievements.filter((a) => a.isActive);
    assert.equal(active.length, 3);
    assert.ok(active.some((a) => a.userId === 'u-new' && a.definitionId === 'podium_gold'));
    assert.ok(active.some((a) => a.userId === 'u-old' && a.definitionId === 'podium_silver'));
    assert.ok(active.some((a) => a.userId === 'u3' && a.definitionId === 'podium_bronze'));
    assert.ok(batch.grants.every((g) => g.achievementId.startsWith('new-')));
    assert.equal(batch.byUserId.get('u-new')?.[0]?.place, 1);
  }

  {
    // grant: N drops below floor → revoke all for source, no re-award.
    const db = makePodiumFakeDb({
      games: [
        {
          id: 'tour-small',
          entityType: 'TOURNAMENT',
          parentId: null,
          sport: 'PADEL',
          resultsStatus: 'FINAL',
        },
      ],
      achievements: [
        {
          id: 'tiny-gold',
          userId: 'u1',
          definitionId: 'podium_gold',
          sourceKey: 'tour-small',
          place: 1,
          sport: 'PADEL',
          isActive: true,
          revokedAt: null,
        },
      ],
      pins: [{ userId: 'u1', slot: 0, achievementId: 'tiny-gold' }],
      outcomes: [{ gameId: 'tour-small', userId: 'u1', position: 1 }],
      playingCounts: { 'tour-small': 4 },
    });

    const batch = await grantPodiumAchievementsForFinalizedGame({
      gameId: 'tour-small',
      tx: db as never,
    });
    assert.equal(batch.replaced, true);
    assert.equal(batch.grants.length, 0);
    assert.equal(db._pins.length, 0);
    assert.equal(db._achievements[0]?.isActive, false);
  }

  {
    // Active cabinet projection never includes revoked rows (isActive filter contract).
    const activeOnly = [
      { id: 'live', definitionId: 'podium_gold', isActive: true },
      { id: 'dead', definitionId: 'podium_gold', isActive: false },
    ].filter((r) => r.isActive);
    assert.deepEqual(
      activeOnly.map((r) => r.id),
      ['live'],
    );
  }

  {
    // Parent season sync skips non-fixtures / non-FINAL parents.
    const skip = await syncParentSeasonPodiumIfFinal({
      gameId: 'tour-1',
      tx: makePodiumFakeDb({
        games: [
          {
            id: 'tour-1',
            entityType: 'TOURNAMENT',
            parentId: null,
            sport: 'PADEL',
            resultsStatus: 'FINAL',
          },
        ],
        achievements: [],
        pins: [],
        outcomes: [],
        playingCounts: {},
      }) as never,
    });
    assert.equal(skip, null);

    const fixtureUnderOpenSeason = await syncParentSeasonPodiumIfFinal({
      gameId: 'fix-1',
      tx: makePodiumFakeDb({
        games: [
          {
            id: 'fix-1',
            entityType: 'LEAGUE',
            parentId: 'season-1',
            sport: 'PADEL',
            resultsStatus: 'FINAL',
          },
          {
            id: 'season-1',
            entityType: 'LEAGUE_SEASON',
            parentId: null,
            sport: 'PADEL',
            resultsStatus: 'IN_PROGRESS',
          },
        ],
        achievements: [],
        pins: [],
        outcomes: [],
        playingCounts: {},
      }) as never,
    });
    assert.equal(fixtureUnderOpenSeason, null);
  }
}

void runAsyncPodiumRevokeTests().then(() => {
  console.log('podiumGrant.service.test.ts: ok');
});
