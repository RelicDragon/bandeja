import assert from 'node:assert/strict';
import type { GameTextInvalidation } from '@bandeja/shared/gameTextRealtime';
import { GAME_TEXT_INVALIDATE_EVENT } from '@bandeja/shared/gameTextRealtime';

const originalSocketService = (global as { socketService?: unknown }).socketService;
const events: Array<{
  payload: GameTextInvalidation;
  userIds: string[];
}> = [];

async function run(): Promise<void> {
  assert.equal(GAME_TEXT_INVALIDATE_EVENT, 'game-text:invalidate');

  (global as { socketService?: unknown }).socketService = {
    emitGameTextInvalidation(payload: GameTextInvalidation, userIds: string[]) {
      events.push({ payload, userIds });
    },
  };

  // Dynamic import after mock so module can resolve emitter at call time.
  const { publishGameTextInvalidation } = await import('./gameTextRealtime');

  // Without a real game row, resolveAuthorizedUserIds returns [] — still emits to game room path.
  await publishGameTextInvalidation({
    gameId: 'missing-game',
    locale: 'ru',
    nameSourceRevision: 2,
    descriptionSourceRevision: 3,
    reason: 'published',
  });

  assert.equal(events.length, 1);
  const evt = events[0]!;
  assert.equal(evt.payload.version, 1);
  assert.equal(evt.payload.gameId, 'missing-game');
  assert.equal(evt.payload.locale, 'ru');
  assert.equal(evt.payload.nameSourceRevision, 2);
  assert.equal(evt.payload.descriptionSourceRevision, 3);
  assert.equal(evt.payload.reason, 'published');
  assert.ok(typeof evt.payload.occurredAt === 'string');
  assert.equal(
    'name' in evt.payload || 'description' in evt.payload || 'text' in evt.payload,
    false,
  );
  assert.deepEqual(evt.userIds, []);

  console.log('gameTextRealtime.test.ts: ok');
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    (global as { socketService?: unknown }).socketService = originalSocketService;
  });
