/**
 * Integration: game-text source change helper enqueues jobs in the same transaction.
 * Fails hard when DB_URL / City / game-text tables are missing.
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { APP_UI_LANGUAGES } from '@bandeja/app-locale';
import { applyGameTextSourceChangeInTransaction } from './gameTextSourceChange.service';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function requireDbUrl(): void {
  let url = process.env.DB_URL;
  assert.ok(url, 'DB_URL must be set for game-text source-change integration test');
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
}

async function createProbeGame(
  prisma: typeof import('../../config/database').default,
  cityId: string,
  suffix: string,
): Promise<string> {
  const gameId = `qa-game-text-enq-${suffix}-${Date.now()}`;
  const now = new Date();
  await prisma.game.create({
    data: {
      id: gameId,
      entityType: 'GAME',
      gameType: 'CLASSIC',
      cityId,
      startTime: now,
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      name: 'Original name',
      description: 'Original description',
    },
  });
  return gameId;
}

async function run() {
  requireDbUrl();
  const { default: prisma } = await import('../../config/database');

  try {
    await prisma.gameTextTranslationJob.findFirst({ take: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `game-text localization tables missing — apply migration 20260916010000_game_text_localization: ${message}`,
    );
  }

  const city = await prisma.city.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(city, 'need at least one active City row');

  const editor = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(editor, 'need at least one active User for override editedBy');

  const gameId = await createProbeGame(prisma, city.id, 'main');
  try {
    // Unchanged / scheduling-only → no jobs
    const noop = await prisma.$transaction((tx) =>
      applyGameTextSourceChangeInTransaction(tx, {
        gameId,
        previousName: 'Original name',
        previousDescription: 'Original description',
        nextName: 'Original name',
        nextDescription: 'Original description',
        enqueueJobs: true,
      }),
    );
    assert.equal(noop.jobsCreated, 0);
    assert.equal(noop.shouldUpsertMeta, false);

    // Name-only change
    const nameOnly = await prisma.$transaction((tx) =>
      applyGameTextSourceChangeInTransaction(tx, {
        gameId,
        previousName: 'Original name',
        previousDescription: 'Original description',
        nextName: 'Renamed',
        enqueueJobs: true,
        debounceMs: 0,
      }),
    );
    assert.equal(nameOnly.nameSourceRevision, 1);
    assert.equal(nameOnly.descriptionSourceRevision, 0);
    assert.equal(nameOnly.includeName, true);
    assert.equal(nameOnly.includeDescription, false);
    assert.equal(nameOnly.jobsCreated, APP_UI_LANGUAGES.length);

    const nameJobs = await prisma.gameTextTranslationJob.findMany({
      where: { gameId, status: 'pending' },
    });
    assert.equal(nameJobs.length, APP_UI_LANGUAGES.length);
    assert.ok(nameJobs.every((j) => j.includeName && !j.includeDescription));
    assert.ok(nameJobs.every((j) => j.nameSourceRevision === 1 && j.descriptionSourceRevision === 0));

    const gameAfterName = await prisma.game.findUnique({
      where: { id: gameId },
      select: { name: true, description: true },
    });
    assert.equal(gameAfterName?.name, 'Original name');
    assert.equal(gameAfterName?.description, 'Original description');

    // Description-only on top of prior name revision
    const descOnly = await prisma.$transaction((tx) =>
      applyGameTextSourceChangeInTransaction(tx, {
        gameId,
        previousName: 'Renamed',
        previousDescription: 'Original description',
        nextDescription: 'Updated description',
        enqueueJobs: true,
        debounceMs: 0,
      }),
    );
    assert.equal(descOnly.nameSourceRevision, 1);
    assert.equal(descOnly.descriptionSourceRevision, 1);
    assert.equal(descOnly.includeName, false);
    assert.equal(descOnly.includeDescription, true);
    assert.equal(descOnly.pendingSuperseded, APP_UI_LANGUAGES.length);
    assert.equal(descOnly.jobsCreated, APP_UI_LANGUAGES.length);

    const afterDesc = await prisma.gameTextTranslationJob.findMany({ where: { gameId } });
    const pendingAfterDesc = afterDesc.filter((j) => j.status === 'pending');
    const supersededAfterDesc = afterDesc.filter((j) => j.status === 'superseded');
    assert.equal(pendingAfterDesc.length, APP_UI_LANGUAGES.length);
    assert.equal(supersededAfterDesc.length, APP_UI_LANGUAGES.length);
    assert.ok(pendingAfterDesc.every((j) => !j.includeName && j.includeDescription));

    // Rapid edit supersedes older pending
    const rapid = await prisma.$transaction((tx) =>
      applyGameTextSourceChangeInTransaction(tx, {
        gameId,
        previousName: 'Renamed',
        previousDescription: 'Updated description',
        nextDescription: 'Rapid edit',
        enqueueJobs: true,
        debounceMs: 2000,
        now: new Date('2026-09-16T10:00:00.000Z'),
      }),
    );
    assert.equal(rapid.pendingSuperseded, APP_UI_LANGUAGES.length);
    assert.equal(rapid.descriptionSourceRevision, 2);
    const pendingRapid = await prisma.gameTextTranslationJob.findMany({
      where: { gameId, status: 'pending' },
    });
    assert.equal(pendingRapid.length, APP_UI_LANGUAGES.length);
    assert.ok(
      pendingRapid.every(
        (j) => j.runAfter.toISOString() === '2026-09-16T10:00:02.000Z',
      ),
    );

    // Seed a translation row then clear description → invalidate display + no new jobs for blank
    await prisma.gameTextTranslation.create({
      data: {
        gameId,
        field: 'description',
        locale: 'ru',
        sourceRevision: 1,
        automaticText: 'Старый',
        generationState: 'ready',
      },
    });
    const cleared = await prisma.$transaction((tx) =>
      applyGameTextSourceChangeInTransaction(tx, {
        gameId,
        previousName: 'Renamed',
        previousDescription: 'Rapid edit',
        nextDescription: null,
        enqueueJobs: true,
      }),
    );
    assert.equal(cleared.descriptionCleared, true);
    assert.equal(cleared.includeDescription, false);
    assert.equal(cleared.jobsCreated, 0);
    assert.ok(cleared.pendingSuperseded >= APP_UI_LANGUAGES.length);

    const clearedTranslation = await prisma.gameTextTranslation.findUnique({
      where: {
        gameId_field_locale: { gameId, field: 'description', locale: 'ru' },
      },
    });
    assert.equal(clearedTranslation?.automaticText, null);
    assert.equal(clearedTranslation?.generationState, 'not_needed');
    assert.equal(clearedTranslation?.provenance, 'empty_source');

    // Source bump retires stale manual override into correction history (needs review)
    const overrideGameId = await createProbeGame(prisma, city.id, 'ov');
    try {
      await prisma.gameTextSourceMeta.create({
        data: {
          gameId: overrideGameId,
          nameSourceRevision: 1,
          descriptionSourceRevision: 0,
        },
      });
      await prisma.gameTextTranslation.create({
        data: {
          gameId: overrideGameId,
          field: 'name',
          locale: 'ru',
          sourceRevision: 1,
          automaticText: 'Авто',
          generationState: 'ready',
          provenance: 'manual_override',
          manualOverrideText: 'Ручной',
          manualOverrideSourceRevision: 1,
          manualOverrideEditedBy: editor.id,
          manualOverrideEditedAt: new Date(),
          recordRevision: 3,
        },
      });

      const retired = await prisma.$transaction((tx) =>
        applyGameTextSourceChangeInTransaction(tx, {
          gameId: overrideGameId,
          previousName: 'Original name',
          previousDescription: 'Original description',
          nextName: 'New original',
          enqueueJobs: true,
          debounceMs: 0,
        }),
      );
      assert.equal(retired.overridesRetired, 1);
      assert.equal(retired.nameSourceRevision, 2);

      const serving = await prisma.gameTextTranslation.findUnique({
        where: {
          gameId_field_locale: { gameId: overrideGameId, field: 'name', locale: 'ru' },
        },
      });
      assert.equal(serving?.manualOverrideText, null);
      assert.equal(serving?.manualOverrideSourceRevision, null);
      assert.equal(serving?.manualOverrideEditedBy, null);
      assert.equal(serving?.automaticText, null);
      assert.equal(serving?.sourceRevision, 2);
      assert.equal(serving?.recordRevision, 4);

      const history = await prisma.gameTextTranslationCorrection.findMany({
        where: { gameId: overrideGameId, field: 'name', locale: 'ru' },
      });
      assert.equal(history.length, 1);
      assert.equal(history[0]?.correctedText, 'Ручной');
      assert.equal(history[0]?.sourceRevision, 1);
      assert.equal(history[0]?.sourceTextSnapshot, 'Original name');
      assert.equal(history[0]?.previousAutomaticText, 'Авто');
      assert.equal(history[0]?.supersededAt, null);
      assert.equal(history[0]?.editedBy, editor.id);
    } finally {
      await prisma.game.delete({ where: { id: overrideGameId } }).catch(() => undefined);
    }

    // League-season style: game.create + helper in ONE txn; rollback leaves neither
    const seasonRollbackId = `qa-game-text-season-rb-${Date.now()}`;
    let seasonRolled = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.game.create({
          data: {
            id: seasonRollbackId,
            entityType: 'LEAGUE_SEASON',
            gameType: 'CLASSIC',
            cityId: city.id,
            startTime: new Date(),
            endTime: new Date(Date.now() + 3600000),
            name: 'Season One',
          },
        });
        await applyGameTextSourceChangeInTransaction(tx, {
          gameId: seasonRollbackId,
          previousName: null,
          previousDescription: null,
          nextName: 'Season One',
          nextDescription: null,
          enqueueJobs: true,
          debounceMs: 0,
        });
        throw new Error('force-season-rollback');
      });
    } catch (err) {
      seasonRolled = err instanceof Error && err.message === 'force-season-rollback';
      if (!seasonRolled) throw err;
    }
    assert.equal(seasonRolled, true);
    assert.equal(await prisma.game.findUnique({ where: { id: seasonRollbackId } }), null);
    assert.equal(await prisma.gameTextSourceMeta.count({ where: { gameId: seasonRollbackId } }), 0);
    assert.equal(
      await prisma.gameTextTranslationJob.count({ where: { gameId: seasonRollbackId } }),
      0,
    );

    // Rollback leaves neither text meta bump nor orphan jobs
    const rollbackGameId = await createProbeGame(prisma, city.id, 'rb');
    try {
      let rolled = false;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.game.update({
            where: { id: rollbackGameId },
            data: { name: 'Should not stick' },
          });
          await applyGameTextSourceChangeInTransaction(tx, {
            gameId: rollbackGameId,
            previousName: 'Original name',
            previousDescription: 'Original description',
            nextName: 'Should not stick',
            enqueueJobs: true,
            debounceMs: 0,
          });
          throw new Error('force-rollback');
        });
      } catch (err) {
        rolled = err instanceof Error && err.message === 'force-rollback';
        if (!rolled) throw err;
      }
      assert.equal(rolled, true);

      const rbGame = await prisma.game.findUnique({
        where: { id: rollbackGameId },
        select: { name: true },
      });
      assert.equal(rbGame?.name, 'Original name');
      assert.equal(await prisma.gameTextSourceMeta.count({ where: { gameId: rollbackGameId } }), 0);
      assert.equal(
        await prisma.gameTextTranslationJob.count({ where: { gameId: rollbackGameId } }),
        0,
      );
    } finally {
      await prisma.game.delete({ where: { id: rollbackGameId } }).catch(() => undefined);
    }

    // Generation flag off still bumps meta, creates no jobs
    const flagGameId = await createProbeGame(prisma, city.id, 'flag');
    try {
      const flagged = await prisma.$transaction((tx) =>
        applyGameTextSourceChangeInTransaction(tx, {
          gameId: flagGameId,
          previousName: 'Original name',
          previousDescription: 'Original description',
          nextName: 'Flag off rename',
          enqueueJobs: false,
        }),
      );
      assert.equal(flagged.shouldUpsertMeta, true);
      assert.equal(flagged.jobsCreated, 0);
      const meta = await prisma.gameTextSourceMeta.findUnique({ where: { gameId: flagGameId } });
      assert.equal(meta?.nameSourceRevision, 1);
      assert.equal(
        await prisma.gameTextTranslationJob.count({ where: { gameId: flagGameId } }),
        0,
      );
    } finally {
      await prisma.game.delete({ where: { id: flagGameId } }).catch(() => undefined);
    }

    console.log('gameTextSourceChange.integration.test.ts: ok');
  } finally {
    await prisma.game.delete({ where: { id: gameId } }).catch(() => undefined);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
