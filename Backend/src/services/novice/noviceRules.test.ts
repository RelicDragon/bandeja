import assert from 'node:assert/strict';
import { EntityType, GameStatus, ParticipantStatus } from '@prisma/client';
import {
  isCountedGame,
  nextMilestoneSeenRank,
  planNoviceRecount,
  type CountedGameCandidate,
  type NoviceStoredProgress,
} from './noviceRules';
import {
  NOVICE_PUSH_LANGUAGES,
  NOVICE_PUSH_BODY_TABLE,
  NOVICE_RANK_NAME_TABLE,
  buildNoviceRankUpPushPayload,
  resolveNovicePushLanguage,
} from './novicePushCopy';

function row(overrides: Partial<CountedGameCandidate> & { entityType?: EntityType; status?: GameStatus }): CountedGameCandidate {
  return {
    participantStatus: overrides.participantStatus ?? ParticipantStatus.PLAYING,
    noShowNotedAt: overrides.noShowNotedAt ?? null,
    hasOutcome: overrides.hasOutcome ?? false,
    game: {
      status: overrides.status ?? GameStatus.FINISHED,
      entityType: overrides.entityType ?? EntityType.GAME,
    },
  };
}

// --- counted-game rules -----------------------------------------------------
assert.equal(isCountedGame(row({ hasOutcome: true })), true, 'GAME with outcome counts');
assert.equal(isCountedGame(row({ hasOutcome: false })), false, 'GAME without outcome does not');
assert.equal(
  isCountedGame(row({ entityType: EntityType.TOURNAMENT, hasOutcome: true, status: GameStatus.ARCHIVED })),
  true,
  'ARCHIVED tournament with outcome counts',
);
assert.equal(isCountedGame(row({ entityType: EntityType.LEAGUE, hasOutcome: true })), true);
assert.equal(isCountedGame(row({ entityType: EntityType.TRAINING })), true, 'training without outcome counts');
assert.equal(isCountedGame(row({ entityType: EntityType.BAR, status: GameStatus.ARCHIVED })), true);
assert.equal(
  isCountedGame(row({ entityType: EntityType.TRAINING, noShowNotedAt: new Date() })),
  false,
  'no-show at a training does not count',
);
assert.equal(
  isCountedGame(row({ entityType: EntityType.BAR, noShowNotedAt: new Date() })),
  false,
  'no-show at a bar does not count',
);
assert.equal(
  isCountedGame(row({ entityType: EntityType.TRAINING, noShowNotedAt: new Date(), hasOutcome: true })),
  true,
  'an outcome row counts even with a no-show note',
);
assert.equal(isCountedGame(row({ entityType: EntityType.EVENT, hasOutcome: true })), false, 'EVENT never counts');
assert.equal(isCountedGame(row({ entityType: EntityType.LEAGUE_SEASON, hasOutcome: true })), false);
assert.equal(
  isCountedGame(row({ participantStatus: ParticipantStatus.NON_PLAYING, entityType: EntityType.TRAINING })),
  false,
  'NON_PLAYING (trainer) does not count',
);
assert.equal(isCountedGame(row({ participantStatus: ParticipantStatus.IN_QUEUE, hasOutcome: true })), false);
assert.equal(isCountedGame(row({ status: GameStatus.ANNOUNCED, entityType: EntityType.TRAINING })), false);
assert.equal(isCountedGame(row({ status: GameStatus.STARTED, hasOutcome: true })), false);

// --- recount plan -----------------------------------------------------------
const fresh: NoviceStoredProgress = {
  noviceCountedGames: 0,
  noviceRank: 0,
  noviceDebutGameId: null,
  noviceDebutHostUserId: null,
};

{
  const plan = planNoviceRecount({
    userId: 'u1',
    stored: fresh,
    countedGames: 1,
    firstCountedGame: { gameId: 'g1', ownerUserId: 'host' },
  });
  assert.equal(plan.newRank, 1);
  assert.equal(plan.previousRank, 0);
  assert.deepEqual(plan.debut, { gameId: 'g1', hostUserId: 'host' }, 'debut + host on first counted game');
  assert.equal(plan.changed, true);
}

{
  const plan = planNoviceRecount({
    userId: 'u1',
    stored: fresh,
    countedGames: 1,
    firstCountedGame: { gameId: 'g1', ownerUserId: 'u1' },
  });
  assert.deepEqual(plan.debut, { gameId: 'g1', hostUserId: null }, 'no self-credit');
}

{
  const stored = { ...fresh, noviceCountedGames: 1, noviceRank: 1, noviceDebutGameId: 'g1', noviceDebutHostUserId: 'host' };
  const plan = planNoviceRecount({
    userId: 'u1',
    stored,
    countedGames: 2,
    firstCountedGame: { gameId: 'g0', ownerUserId: 'other' },
  });
  assert.equal(plan.debut, null, 'debut host is set once, never moved');
  assert.equal(plan.newRank, 2);
}

{
  const stored = { ...fresh, noviceCountedGames: 3, noviceRank: 3 };
  const plan = planNoviceRecount({
    userId: 'u1',
    stored,
    countedGames: 4,
    firstCountedGame: { gameId: 'g0', ownerUserId: 'host' },
  });
  assert.equal(plan.debut, null, 'backfilled users with games never get a retroactive debut');
}

{
  const stored = { ...fresh, noviceCountedGames: 4, noviceRank: 4, noviceDebutGameId: 'g1' };
  const plan = planNoviceRecount({ userId: 'u1', stored, countedGames: 2, firstCountedGame: null });
  assert.equal(plan.newRank, 4, 'rank never demotes when results are undone');
  assert.equal(plan.countedGames, 2, 'count stays honest');
  assert.equal(plan.changed, true);
}

{
  const stored = { ...fresh, noviceCountedGames: 2, noviceRank: 2, noviceDebutGameId: 'g1' };
  const plan = planNoviceRecount({ userId: 'u1', stored, countedGames: 2, firstCountedGame: null });
  assert.equal(plan.changed, false, 'recount is idempotent');
  assert.equal(plan.newRank, 2);
}

{
  const plan = planNoviceRecount({
    userId: 'u1',
    stored: fresh,
    countedGames: 9,
    firstCountedGame: { gameId: 'g1', ownerUserId: 'host' },
  });
  assert.equal(plan.newRank, 5, 'multi-rank jump capped at Regular');
}

// --- milestone-seen clamp ---------------------------------------------------
assert.equal(nextMilestoneSeenRank({ currentSeenRank: 1, noviceRank: 3, ackRank: 3 }), 3);
assert.equal(nextMilestoneSeenRank({ currentSeenRank: 1, noviceRank: 3, ackRank: 5 }), 3, 'never ahead of the rank');
assert.equal(nextMilestoneSeenRank({ currentSeenRank: 2, noviceRank: 3, ackRank: 1 }), 2, 'never lowered');
assert.equal(nextMilestoneSeenRank({ currentSeenRank: 0, noviceRank: 0, ackRank: Number.NaN }), 0);

// --- push copy --------------------------------------------------------------
const APP_LANGUAGES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'];
assert.deepEqual([...NOVICE_PUSH_LANGUAGES].sort(), [...APP_LANGUAGES].sort());
for (const lang of APP_LANGUAGES) {
  assert.equal(NOVICE_RANK_NAME_TABLE[lang]?.length, 6, `${lang} has six rank names`);
  assert.ok(NOVICE_PUSH_BODY_TABLE[lang]?.includes('{{rank}}'), `${lang} body interpolates the rank`);
}
assert.equal(resolveNovicePushLanguage('ru-RU'), 'ru');
assert.equal(resolveNovicePushLanguage('auto'), 'en');
assert.equal(resolveNovicePushLanguage(null), 'en');
{
  const payload = buildNoviceRankUpPushPayload({ rank: 5, language: 'en' });
  assert.equal(payload.type, 'NOVICE_RANK_UP');
  assert.equal(payload.title, 'Your results are in');
  assert.ok(payload.body.includes('Regular'));
  assert.deepEqual(payload.data, { noviceRank: '5' });
}

console.log('noviceRules.test.ts: ok');
