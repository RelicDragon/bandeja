/**
 * Integration: organizer translation editor — permissions, conflict, correction vs AI.
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, ParticipantRole } from '@prisma/client';
import { expectApiError } from '../../testHelpers';
import { publishGameTextTranslationResult } from './gameTextTranslationPublish.service';
import { resolveGameLocalizedText } from './gameTextLocalizedText.resolve';
import {
  assertCanEditGameTextTranslations,
  listGameTextTranslations,
  patchGameTextTranslation,
} from './gameTextEditor.service';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function requireDbUrl(): void {
  let url = process.env.DB_URL;
  assert.ok(url, 'DB_URL must be set for game-text editor integration test');
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
}

async function run() {
  requireDbUrl();
  const { default: prisma } = await import('../../config/database');

  try {
    await prisma.gameTextTranslation.findFirst({ take: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`game-text tables missing: ${message}`);
  }

  const city = await prisma.city.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(city, 'need active City');

  const suffix = `${Date.now()}`;
  const owner = await prisma.user.create({
    data: {
      phone: `qa-gte-owner-${suffix}`,
      email: `qa-gte-owner-${suffix}@test.local`,
      firstName: 'Owner',
      lastName: 'GTE',
      isActive: true,
    },
    select: { id: true },
  });
  const player = await prisma.user.create({
    data: {
      phone: `qa-gte-player-${suffix}`,
      email: `qa-gte-player-${suffix}@test.local`,
      firstName: 'Player',
      lastName: 'GTE',
      isActive: true,
    },
    select: { id: true },
  });

  const now = new Date();
  const gameId = `qa-gte-${suffix}`;
  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: now,
      endTime: new Date(now.getTime() + 3_600_000),
      name: 'Sunday social',
      description: 'Bring balls',
      participants: {
        create: [
          { userId: owner.id, role: ParticipantRole.OWNER, status: 'PLAYING' },
          { userId: player.id, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
        ],
      },
    },
  });

  await prisma.gameTextSourceMeta.create({
    data: {
      gameId,
      nameSourceRevision: 1,
      descriptionSourceRevision: 1,
    },
  });

  await prisma.gameTextTranslation.create({
    data: {
      gameId,
      field: 'name',
      locale: 'es',
      sourceRevision: 1,
      automaticText: 'Social del domingo',
      generationState: 'ready',
      provenance: 'automatic',
      recordRevision: 1,
    },
  });
  await prisma.gameTextTranslation.create({
    data: {
      gameId,
      field: 'description',
      locale: 'es',
      sourceRevision: 1,
      automaticText: 'Trae pelotas',
      generationState: 'ready',
      provenance: 'automatic',
      recordRevision: 1,
    },
  });

  try {
    // Permissions: regular player cannot edit
    await expectApiError(
      () => assertCanEditGameTextTranslations(gameId, player.id),
      403,
      'Only game owners or admins can perform this action',
    );

    // Owner can list
    await assertCanEditGameTextTranslations(gameId, owner.id);
    const listed = await listGameTextTranslations(gameId);
    assert.equal(listed.meta.nameSourceRevision, 1);
    const es = listed.locales.find((l) => l.locale === 'es');
    assert.ok(es);
    assert.equal(es.status, 'ready');
    assert.equal(es.name.automaticText, 'Social del domingo');

    // Correction wins vs AI publish
    const afterSet = await patchGameTextTranslation({
      gameId,
      locale: 'es',
      editorUserId: owner.id,
      name: {
        action: 'set',
        text: 'Domingo social (corregido)',
        expectedSourceRevision: 1,
        expectedRecordRevision: 1,
      },
    });
    const esEdited = afterSet.locales.find((l) => l.locale === 'es');
    assert.ok(esEdited);
    assert.equal(esEdited.status, 'edited');
    assert.equal(esEdited.name.effectiveText, 'Domingo social (corregido)');
    assert.equal(esEdited.name.recordRevision, 2);

    const job = await prisma.gameTextTranslationJob.create({
      data: {
        gameId,
        targetLocale: 'es',
        nameSourceRevision: 1,
        descriptionSourceRevision: 1,
        policyVersion: 1,
        includeName: true,
        includeDescription: false,
        status: 'running',
        leaseOwner: 'test-worker',
        claimToken: 7n,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const pub = await publishGameTextTranslationResult({
      jobId: job.id,
      claimToken: 7n,
      leaseOwner: 'test-worker',
      expectedNameSourceRevision: 1,
      expectedDescriptionSourceRevision: 1,
      fields: {
        name: { text: 'IA no debe ganar', noChange: false },
      },
    });
    assert.equal(pub.status, 'published');

    const row = await prisma.gameTextTranslation.findUnique({
      where: {
        gameId_field_locale: { gameId, field: 'name', locale: 'es' },
      },
    });
    assert.ok(row);
    assert.equal(row.manualOverrideText, 'Domingo social (corregido)');
    assert.equal(row.automaticText, 'IA no debe ganar');

    const resolved = resolveGameLocalizedText({
      locale: 'es',
      name: 'Sunday social',
      description: 'Bring balls',
      meta: {
        nameSourceRevision: 1,
        descriptionSourceRevision: 1,
        keepOriginalNameInAllLocales: false,
      },
      rows: [
        {
          field: 'name',
          locale: 'es',
          sourceRevision: row.sourceRevision,
          automaticText: row.automaticText,
          generationState: row.generationState,
          provenance: row.provenance,
          manualOverrideText: row.manualOverrideText,
          manualOverrideSourceRevision: row.manualOverrideSourceRevision,
        },
      ],
    });
    assert.equal(resolved.name.text, 'Domingo social (corregido)');
    assert.equal(resolved.name.provenance, 'manual_override');

    // Conflict on record revision mismatch
    await expectApiError(
      () =>
        patchGameTextTranslation({
          gameId,
          locale: 'es',
          editorUserId: owner.id,
          name: {
            action: 'set',
            text: 'stale',
            expectedSourceRevision: 1,
            expectedRecordRevision: 1,
          },
        }),
      409,
      'Translation record revision conflict',
    );

    // Conflict on source revision mismatch
    await expectApiError(
      () =>
        patchGameTextTranslation({
          gameId,
          locale: 'es',
          editorUserId: owner.id,
          name: {
            action: 'clear',
            expectedSourceRevision: 99,
            expectedRecordRevision: row.recordRevision,
          },
        }),
      409,
      'Translation source revision conflict',
    );

    // Clear correction → automatic wins again
    const cleared = await patchGameTextTranslation({
      gameId,
      locale: 'es',
      editorUserId: owner.id,
      name: {
        action: 'clear',
        expectedSourceRevision: 1,
        expectedRecordRevision: row.recordRevision,
      },
    });
    const esCleared = cleared.locales.find((l) => l.locale === 'es');
    assert.ok(esCleared);
    assert.equal(esCleared.name.hasActiveCorrection, false);
    assert.equal(esCleared.name.effectiveText, 'IA no debe ganar');

    // Archived games blocked
    await prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.ARCHIVED },
    });
    await expectApiError(
      () => assertCanEditGameTextTranslations(gameId, owner.id),
      400,
      'Cannot modify archived games',
    );

    console.log('gameTextEditor.service.integration.test.ts: ok');
  } finally {
    await prisma.game.delete({ where: { id: gameId } }).catch(() => undefined);
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, player.id] } },
    });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
