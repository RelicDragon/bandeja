/**
 * Integration: game-text translation worker claim/fence/publish acceptance.
 * Uses a mock translator — never calls the real AI provider.
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { GAME_TEXT_TRANSLATION_POLICY_VERSION } from '@bandeja/app-locale';
import { applyGameTextSourceChangeInTransaction } from './gameTextSourceChange.service';
import { GameTextTranslationQueueService } from './gameTextTranslationQueue.service';
import { publishGameTextTranslationResult } from './gameTextTranslationPublish.service';
import { reconcileGameTextTranslationJobs } from './gameTextTranslationReconcile.service';
import {
  setGameTextTranslateImplForTests,
  type GameTextTranslateFn,
} from './gameTextTranslator.service';
import { GameTextTranslationError } from './gameTextTranslationErrors';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function requireDbUrl(): void {
  let url = process.env.DB_URL;
  assert.ok(url, 'DB_URL must be set for game-text translation worker integration test');
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
}

async function createProbeGame(
  prisma: typeof import('../../config/database').default,
  cityId: string,
  suffix: string,
  name = 'Sunday social',
  description = 'Bring 2 tubes https://example.com/balls cost 15',
): Promise<string> {
  const gameId = `qa-gtw-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date();
  await prisma.game.create({
    data: {
      id: gameId,
      entityType: 'GAME',
      gameType: 'CLASSIC',
      cityId,
      startTime: now,
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      name,
      description,
    },
  });
  return gameId;
}

async function enqueueJob(
  prisma: typeof import('../../config/database').default,
  gameId: string,
  locale = 'es',
): Promise<string> {
  await prisma.$transaction((tx) =>
    applyGameTextSourceChangeInTransaction(tx, {
      gameId,
      previousName: null,
      previousDescription: null,
      nextName: 'Sunday social',
      nextDescription: 'Bring 2 tubes https://example.com/balls cost 15',
      enqueueJobs: true,
      debounceMs: 0,
      locales: [locale],
    }),
  );
  const job = await prisma.gameTextTranslationJob.findFirst({
    where: { gameId, targetLocale: locale, status: 'pending' },
  });
  assert.ok(job, 'expected pending job');
  return job.id;
}

async function run() {
  requireDbUrl();
  process.env.GAME_TEXT_LOCALIZATION_GENERATION_ENABLED = 'true';
  process.env.GAME_TEXT_TRANSLATION_QUEUE_MAX_ATTEMPTS = '3';

  const { default: prisma } = await import('../../config/database');
  const { config } = await import('../../config/env');
  // Hot-patch maxAttempts if config already loaded before env set.
  (config.gameTextTranslationQueue as { maxAttempts: number }).maxAttempts = 3;

  try {
    await prisma.gameTextTranslationJob.findFirst({ take: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `game-text localization tables missing — apply migration: ${message}`,
    );
  }

  const city = await prisma.city.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(city, 'need active City');
  const editor = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(editor, 'need active User');

  const gamesToDelete: string[] = [];
  let aiCalls = 0;
  const okTranslate: GameTextTranslateFn = async (input) => {
    aiCalls += 1;
    const out: Awaited<ReturnType<GameTextTranslateFn>> = {};
    if (input.fields.name) {
      out.name = { text: `ES:${input.fields.name}`, noChange: false };
    }
    if (input.fields.description) {
      out.description = {
        text: `ES:${input.fields.description}`,
        noChange: false,
      };
    }
    return out;
  };

  try {
    // --- provider fail → retries; save path never calls AI ---
    {
      const gameId = await createProbeGame(prisma, city.id, 'retry');
      gamesToDelete.push(gameId);
      const jobId = await enqueueJob(prisma, gameId);
      aiCalls = 0;
      let failCalls = 0;
      setGameTextTranslateImplForTests(async () => {
        failCalls += 1;
        throw new GameTextTranslationError('provider down', 'provider');
      });

      const claimed = await GameTextTranslationQueueService.claimJobById(jobId);
      assert.ok(claimed);
      assert.equal(claimed.job.gameId, gameId);
      await GameTextTranslationQueueService.runClaimedJob(claimed);
      const afterFail = await prisma.gameTextTranslationJob.findUnique({
        where: { id: claimed.id },
      });
      assert.equal(afterFail?.status, 'pending');
      assert.equal(afterFail?.attempts, 1);
      assert.equal(afterFail?.errorCategory, 'provider');
      assert.ok(failCalls >= 1);

      // Publication path must not invoke AI
      const beforePublishAi = aiCalls;
      setGameTextTranslateImplForTests(okTranslate);
      const pub = await publishGameTextTranslationResult({
        jobId: claimed.id,
        claimToken: claimed.claimToken,
        leaseOwner: claimed.leaseOwner,
        expectedNameSourceRevision: claimed.job.nameSourceRevision,
        expectedDescriptionSourceRevision: claimed.job.descriptionSourceRevision,
        fields: {
          name: { text: 'should-not-save-without-running', noChange: false },
        },
      });
      // Job was released to pending — publish should discard as not running
      assert.equal(pub.status, 'discarded');
      assert.equal(aiCalls, beforePublishAi);
    }

    // --- two workers / expired lease / late completion cannot publish obsolete ---
    {
      const gameId = await createProbeGame(prisma, city.id, 'fence');
      gamesToDelete.push(gameId);
      const jobId = await enqueueJob(prisma, gameId, 'ru');
      setGameTextTranslateImplForTests(okTranslate);

      const first = await GameTextTranslationQueueService.claimJobById(jobId);
      assert.ok(first);
      assert.equal(first.id, jobId);
      const firstToken = first.claimToken;

      // Expire lease so second worker can reclaim
      await prisma.gameTextTranslationJob.update({
        where: { id: jobId },
        data: { leaseExpiresAt: new Date(Date.now() - 1000) },
      });

      const second = await GameTextTranslationQueueService.claimJobById(jobId);
      assert.ok(second);
      assert.equal(second.id, jobId);
      assert.notEqual(second.claimToken, firstToken);
      assert.equal(second.claimToken, firstToken + 1n);

      // Late first worker publish must discard
      const late = await publishGameTextTranslationResult({
        jobId,
        claimToken: firstToken,
        leaseOwner: first.leaseOwner,
        expectedNameSourceRevision: first.job.nameSourceRevision,
        expectedDescriptionSourceRevision: first.job.descriptionSourceRevision,
        fields: { name: { text: 'STALE-FROM-FIRST', noChange: false } },
      });
      assert.equal(late.status, 'discarded');
      assert.equal(late.reason, 'lease_mismatch');

      await GameTextTranslationQueueService.runClaimedJob(second);
      const row = await prisma.gameTextTranslation.findUnique({
        where: {
          gameId_field_locale: { gameId, field: 'name', locale: 'ru' },
        },
      });
      assert.ok(row?.automaticText);
      assert.ok(!row.automaticText.includes('STALE-FROM-FIRST'));
      assert.ok(row.automaticText.startsWith('ES:'));
    }

    // --- rapid edits discard stale AI result ---
    {
      const gameId = await createProbeGame(prisma, city.id, 'rapid');
      gamesToDelete.push(gameId);
      const jobId = await enqueueJob(prisma, gameId, 'cs');
      setGameTextTranslateImplForTests(okTranslate);
      const claimed = await GameTextTranslationQueueService.claimJobById(jobId);
      assert.ok(claimed);
      assert.equal(claimed.job.gameId, gameId);

      // Source bumps while AI "in flight" (real edit updates Game + meta/jobs together)
      await prisma.$transaction(async (tx) => {
        await tx.game.update({
          where: { id: gameId },
          data: { name: 'Monday social' },
        });
        await applyGameTextSourceChangeInTransaction(tx, {
          gameId,
          previousName: 'Sunday social',
          previousDescription: 'Bring 2 tubes https://example.com/balls cost 15',
          nextName: 'Monday social',
          enqueueJobs: true,
          debounceMs: 0,
          locales: ['cs'],
        });
      });

      const stalePublish = await publishGameTextTranslationResult({
        jobId: claimed.id,
        claimToken: claimed.claimToken,
        leaseOwner: claimed.leaseOwner,
        expectedNameSourceRevision: claimed.job.nameSourceRevision,
        expectedDescriptionSourceRevision: claimed.job.descriptionSourceRevision,
        fields: { name: { text: 'STALE-RAPID', noChange: false } },
      });
      assert.equal(stalePublish.status, 'discarded');
      assert.equal(stalePublish.reason, 'revision_mismatch');

      const staleRow = await prisma.gameTextTranslation.findUnique({
        where: {
          gameId_field_locale: { gameId, field: 'name', locale: 'cs' },
        },
      });
      assert.ok(!staleRow || staleRow.automaticText !== 'STALE-RAPID');

      const gameCols = await prisma.game.findUnique({
        where: { id: gameId },
        select: { name: true, description: true },
      });
      assert.equal(gameCols?.name, 'Monday social');
    }

    // --- manual correction wins vs in-flight AI ---
    {
      const gameId = await createProbeGame(prisma, city.id, 'manual');
      gamesToDelete.push(gameId);
      const jobId = await enqueueJob(prisma, gameId, 'ar');
      setGameTextTranslateImplForTests(okTranslate);
      const claimed = await GameTextTranslationQueueService.claimJobById(jobId);
      assert.ok(claimed);

      await prisma.gameTextTranslation.upsert({
        where: {
          gameId_field_locale: { gameId, field: 'name', locale: 'ar' },
        },
        create: {
          gameId,
          field: 'name',
          locale: 'ar',
          sourceRevision: claimed.job.nameSourceRevision,
          generationState: 'pending',
          manualOverrideText: 'ORGANIZER-AR',
          manualOverrideSourceRevision: claimed.job.nameSourceRevision,
          manualOverrideEditedBy: editor.id,
          manualOverrideEditedAt: new Date(),
          provenance: 'manual_override',
        },
        update: {
          manualOverrideText: 'ORGANIZER-AR',
          manualOverrideSourceRevision: claimed.job.nameSourceRevision,
          manualOverrideEditedBy: editor.id,
          manualOverrideEditedAt: new Date(),
          provenance: 'manual_override',
        },
      });

      const pub = await publishGameTextTranslationResult({
        jobId: claimed.id,
        claimToken: claimed.claimToken,
        leaseOwner: claimed.leaseOwner,
        expectedNameSourceRevision: claimed.job.nameSourceRevision,
        expectedDescriptionSourceRevision: claimed.job.descriptionSourceRevision,
        fields: {
          name: { text: 'AI-SHOULD-NOT-WIPE-OVERRIDE', noChange: false },
          description: {
            text: 'ES:Bring 2 tubes https://example.com/balls cost 15',
            noChange: false,
          },
        },
      });
      assert.equal(pub.status, 'published');

      const nameRow = await prisma.gameTextTranslation.findUnique({
        where: {
          gameId_field_locale: { gameId, field: 'name', locale: 'ar' },
        },
      });
      assert.equal(nameRow?.manualOverrideText, 'ORGANIZER-AR');
      assert.equal(nameRow?.automaticText, 'AI-SHOULD-NOT-WIPE-OVERRIDE');
      assert.equal(nameRow?.manualOverrideEditedBy, editor.id);
    }

    // --- never rewrite Game.name/description ---
    {
      const gameId = await createProbeGame(
        prisma,
        city.id,
        'orig',
        'KEEP-NAME',
        'KEEP-DESC',
      );
      gamesToDelete.push(gameId);
      await prisma.$transaction((tx) =>
        applyGameTextSourceChangeInTransaction(tx, {
          gameId,
          previousName: null,
          previousDescription: null,
          nextName: 'KEEP-NAME',
          nextDescription: 'KEEP-DESC',
          enqueueJobs: true,
          debounceMs: 0,
          locales: ['ja'],
        }),
      );
      setGameTextTranslateImplForTests(async () => ({
        name: { text: '翻訳名', noChange: false },
        description: { text: '翻訳説明', noChange: false },
      }));
      const jobRow = await prisma.gameTextTranslationJob.findFirst({
        where: { gameId, targetLocale: 'ja', status: 'pending' },
      });
      assert.ok(jobRow);
      const claimed = await GameTextTranslationQueueService.claimJobById(jobRow.id);
      assert.ok(claimed);
      await GameTextTranslationQueueService.runClaimedJob(claimed);
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { name: true, description: true },
      });
      assert.equal(game?.name, 'KEEP-NAME');
      assert.equal(game?.description, 'KEEP-DESC');
      const tr = await prisma.gameTextTranslation.findUnique({
        where: {
          gameId_field_locale: { gameId, field: 'name', locale: 'ja' },
        },
      });
      assert.equal(tr?.automaticText, '翻訳名');
    }

    // --- feature flag off → drain no-ops ---
    {
      const gameId = await createProbeGame(prisma, city.id, 'flag');
      gamesToDelete.push(gameId);
      await enqueueJob(prisma, gameId, 'th');
      process.env.GAME_TEXT_LOCALIZATION_GENERATION_ENABLED = 'false';
      aiCalls = 0;
      setGameTextTranslateImplForTests(okTranslate);
      await GameTextTranslationQueueService.drain();
      assert.equal(aiCalls, 0);
      const stillPending = await prisma.gameTextTranslationJob.count({
        where: { gameId, status: 'pending' },
      });
      assert.ok(stillPending >= 1);
      process.env.GAME_TEXT_LOCALIZATION_GENERATION_ENABLED = 'true';
    }

    // --- reconcile does not touch terminal failures ---
    {
      const gameId = await createProbeGame(prisma, city.id, 'recon');
      gamesToDelete.push(gameId);
      const failedJob = await prisma.gameTextTranslationJob.create({
        data: {
          gameId,
          targetLocale: 'hi',
          nameSourceRevision: 1,
          descriptionSourceRevision: 1,
          policyVersion: GAME_TEXT_TRANSLATION_POLICY_VERSION,
          includeName: true,
          includeDescription: true,
          status: 'failed',
          attempts: 9,
          lastError: 'terminal',
          errorCategory: 'provider',
        },
      });
      await prisma.gameTextTranslationJob.create({
        data: {
          gameId,
          targetLocale: 'id',
          nameSourceRevision: 1,
          descriptionSourceRevision: 1,
          policyVersion: GAME_TEXT_TRANSLATION_POLICY_VERSION,
          includeName: true,
          includeDescription: false,
          status: 'running',
          leaseOwner: 'dead-worker',
          leaseExpiresAt: new Date(Date.now() - 5000),
          claimToken: 3n,
        },
      });
      const stats = await reconcileGameTextTranslationJobs();
      assert.ok(stats.expiredLeasesRequeued >= 1);
      const failed = await prisma.gameTextTranslationJob.findUnique({
        where: { id: failedJob.id },
      });
      assert.equal(failed?.status, 'failed');
      assert.equal(failed?.attempts, 9);
      assert.ok(stats.terminalFailuresLeftUntouched >= 1);
    }

    console.log('gameTextTranslationQueue.integration.test.ts: ok');
  } finally {
    setGameTextTranslateImplForTests(null);
    delete process.env.GAME_TEXT_LOCALIZATION_GENERATION_ENABLED;
    for (const id of gamesToDelete) {
      await prisma.game.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
