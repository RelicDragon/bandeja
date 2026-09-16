/**
 * DB check: unique constraints + cascade delete for game-text localization models.
 * Fails hard when DB_URL, City, User, or game-text tables are missing.
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { Prisma } from '@prisma/client';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function requireDbUrl(): void {
  let url = process.env.DB_URL;
  assert.ok(url, 'DB_URL must be set for game-text localization schema integration test');
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
}

function isP2002(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function expectUniqueViolation(label: string, op: () => Promise<unknown>): Promise<void> {
  let hit = false;
  try {
    await op();
  } catch (err) {
    hit = isP2002(err);
    if (!hit) throw err;
  }
  assert.equal(hit, true, `expected P2002 unique violation: ${label}`);
}

async function run() {
  requireDbUrl();

  const { default: prisma } = await import('../../config/database');

  // Fail hard if migration/tables are not applied (do not soft-skip).
  try {
    await prisma.gameTextSourceMeta.findFirst({ take: 1 });
    await prisma.gameTextTranslation.findFirst({ take: 1 });
    await prisma.gameTextTranslationCorrection.findFirst({ take: 1 });
    await prisma.gameTextTranslationJob.findFirst({ take: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `game-text localization tables missing or unusable — apply migration 20260916010000_game_text_localization first: ${message}`,
    );
  }

  const city = await prisma.city.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(city, 'need at least one active City row');

  const editor = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(editor, 'need at least one active User row for correction.editedBy');

  const gameId = `qa-game-text-${Date.now()}`;
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);

  await prisma.game.create({
    data: {
      id: gameId,
      entityType: 'GAME',
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: now,
      endTime: end,
      name: 'Cascade probe',
      description: 'Cascade probe description',
    },
  });

  let deleted = false;
  try {
    await prisma.gameTextSourceMeta.create({
      data: {
        gameId,
        nameSourceRevision: 1,
        descriptionSourceRevision: 1,
        keepOriginalNameInAllLocales: false,
      },
    });
    await prisma.gameTextTranslation.create({
      data: {
        gameId,
        field: 'name',
        locale: 'en',
        sourceRevision: 1,
        generationState: 'pending',
      },
    });
    await prisma.gameTextTranslationJob.create({
      data: {
        gameId,
        targetLocale: 'ru',
        nameSourceRevision: 1,
        descriptionSourceRevision: 1,
        policyVersion: 1,
        includeName: true,
        includeDescription: true,
      },
    });
    await prisma.gameTextTranslationCorrection.create({
      data: {
        gameId,
        field: 'name',
        locale: 'ru',
        sourceRevision: 1,
        correctedText: 'Исправление',
        sourceTextSnapshot: 'Cascade probe',
        previousAutomaticText: null,
        editedBy: editor.id,
      },
    });

    await expectUniqueViolation('(gameId, field, locale) on GameTextTranslation', () =>
      prisma.gameTextTranslation.create({
        data: {
          gameId,
          field: 'name',
          locale: 'en',
          sourceRevision: 1,
          generationState: 'pending',
        },
      }),
    );

    await expectUniqueViolation(
      '(gameId, targetLocale, nameSourceRevision, descriptionSourceRevision, policyVersion) on GameTextTranslationJob',
      () =>
        prisma.gameTextTranslationJob.create({
          data: {
            gameId,
            targetLocale: 'ru',
            nameSourceRevision: 1,
            descriptionSourceRevision: 1,
            policyVersion: 1,
            includeName: true,
            includeDescription: true,
          },
        }),
    );

    const correctionsBefore = await prisma.gameTextTranslationCorrection.count({ where: { gameId } });
    assert.equal(correctionsBefore, 1, 'expected one correction row before Game delete');

    await prisma.game.delete({ where: { id: gameId } });
    deleted = true;

    const [meta, translations, corrections, jobs] = await Promise.all([
      prisma.gameTextSourceMeta.findUnique({ where: { gameId } }),
      prisma.gameTextTranslation.findMany({ where: { gameId } }),
      prisma.gameTextTranslationCorrection.findMany({ where: { gameId } }),
      prisma.gameTextTranslationJob.findMany({ where: { gameId } }),
    ]);
    assert.equal(meta, null);
    assert.equal(translations.length, 0);
    assert.equal(corrections.length, 0, 'correction rows must cascade on Game delete');
    assert.equal(jobs.length, 0);
    console.log('gameTextLocalization.schema.integration.test: ok');
  } finally {
    if (!deleted) {
      await prisma.game.delete({ where: { id: gameId } }).catch(() => undefined);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
