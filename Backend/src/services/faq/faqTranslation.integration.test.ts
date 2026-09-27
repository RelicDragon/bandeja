import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { FaqService } from './faq.service';
import { FaqTranslationService } from './faqTranslation.service';
import { FaqTranslationQueueService } from './faqTranslationQueue.service';
import { FAQ_TRANSLATION_POLICY_VERSION } from './faqTranslator.service';
import { APP_UI_LANGUAGES } from '@bandeja/app-locale';
import { assertCanReadGameFaq } from './faqReadAccess';

async function rejectStatus(action: () => Promise<unknown>, status: number) {
  await assert.rejects(action, error => error instanceof Error && 'statusCode' in error && error.statusCode === status);
}

async function run() {
  if (process.env.DB_SCHEMA !== 'faq_translation_test' || !process.env.DB_URL?.includes('schema=faq_translation_test')) {
    throw new Error('FAQ integration test must run in isolated faq_translation_test schema');
  }
  // No completion is sent: a dummy configured key only enables submission validation.
  const originalProvider = config.ai.provider;
  const originalKey = config.openai.apiKey;
  (config.ai as { provider: 'openai' | 'deepseek' }).provider = 'openai';
  (config.openai as { apiKey: string }).apiKey = 'test-key-no-calls';
  const city = await prisma.city.create({ data: { name: 'FAQ Test City', country: 'RS', timezone: 'Europe/Belgrade' }, select: { id: true } });
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({ data: { phone: `qa-faq-owner-${suffix}`, firstName: 'FAQ', lastName: 'Owner', isActive: true }, select: { id: true } });
  const bulkOwner = await prisma.user.create({ data: { phone: `qa-faq-bulk-${suffix}`, firstName: 'FAQ', lastName: 'Bulk', isActive: true }, select: { id: true } });
  const stranger = await prisma.user.create({ data: { phone: `qa-faq-stranger-${suffix}`, firstName: 'FAQ', lastName: 'Stranger', isActive: true }, select: { id: true } });
  const now = new Date();
  const game = await prisma.game.create({ data: { entityType: 'GAME', gameType: 'CLASSIC', cityId: city.id, startTime: now, endTime: new Date(now.getTime() + 3600000), participants: { create: { userId: owner.id, role: 'OWNER', status: 'PLAYING' } } }, select: { id: true } });
  const makeBulkGame = () => prisma.game.create({ data: { entityType: 'GAME', gameType: 'CLASSIC', cityId: city.id, startTime: now, endTime: new Date(now.getTime() + 3600000), participants: { create: { userId: bulkOwner.id, role: 'OWNER', status: 'PLAYING' } } }, select: { id: true } });
  const bulkGame = await makeBulkGame();
  const secondBulkGame = await makeBulkGame();
  const oversizedGame = await makeBulkGame();
  try {
    const faq = await FaqService.createFaq(game.id, owner.id, { question: 'What time is play?', answer: 'Meet at 20:00.' });
    const initial = await FaqTranslationService.status(game.id);
    assert.equal(initial.faqCount, 1);
    assert.equal(initial.selectedLocales.length, 11);
    await rejectStatus(() => FaqTranslationService.submit(game.id, owner.id, false, { targetLocales: ['es'], sourceLocaleOverride: null, expectedSnapshot: '0'.repeat(64) }, false), 409);
    await rejectStatus(() => FaqTranslationService.submit(game.id, owner.id, false, { targetLocales: ['es', 'es'], sourceLocaleOverride: null, expectedSnapshot: initial.snapshot }, false), 400);
    await rejectStatus(() => FaqTranslationService.submit(game.id, stranger.id, false, { targetLocales: ['es'], sourceLocaleOverride: null, expectedSnapshot: initial.snapshot }, false), 403);
    const body = { targetLocales: ['es'], sourceLocaleOverride: null, expectedSnapshot: initial.snapshot };
    const concurrent = await Promise.all([
      FaqTranslationService.submit(game.id, owner.id, false, body, false),
      FaqTranslationService.submit(game.id, owner.id, false, body, false),
    ]);
    assert.deepEqual(concurrent.map(result => result.queued).sort(), [0, 1]);
    assert.equal(await prisma.gameFaqTranslationJob.count({ where: { faqId: faq.id } }), 1);
    const job = await prisma.gameFaqTranslationJob.findFirstOrThrow({ where: { faqId: faq.id } });
    const claim = await FaqTranslationQueueService.claimJobById(job.id);
    assert.ok(claim);
    await FaqTranslationQueueService.publishClaimedJob(claim, { question: '¿A qué hora jugamos?', answer: 'Nos vemos a las 20:00.', noChange: false });
    const localized = await FaqService.getFaqsByGameId(game.id, 'es');
    assert.ok('localizedText' in localized[0]);
    assert.equal(localized[0].localizedText?.state, 'translated');
    assert.equal((await FaqTranslationService.status(game.id)).locales.find(l => l.locale === 'es')?.ready, 1);
    const unchanged = await FaqService.updateFaq(faq.id, owner.id, { order: 5, question: faq.question }, false);
    assert.equal(unchanged.sourceRevision, 1);
    assert.equal((await FaqTranslationService.status(game.id)).snapshot, initial.snapshot);
    const changed = await FaqService.updateFaq(faq.id, owner.id, { answer: 'Meet at 21:00.' }, false);
    assert.equal(changed.sourceRevision, 2);
    const afterEditRead = (await FaqService.getFaqsByGameId(game.id, 'es'))[0];
    assert.ok('localizedText' in afterEditRead);
    assert.equal(afterEditRead.localizedText?.state, 'original');
    await rejectStatus(() => FaqTranslationService.submit(game.id, owner.id, false, body, false), 409);
    const revised = await FaqTranslationService.status(game.id);
    await FaqTranslationService.submit(game.id, owner.id, false, { ...body, expectedSnapshot: revised.snapshot }, false);
    const pending = await prisma.gameFaqTranslationJob.findFirstOrThrow({ where: { faqId: faq.id, sourceRevision: 2, targetLocale: 'es' } });
    const staleClaim = await FaqTranslationQueueService.claimJobById(pending.id);
    assert.ok(staleClaim);
    await FaqService.updateFaq(faq.id, owner.id, { question: 'What time tomorrow?' }, false);
    await FaqTranslationQueueService.publishClaimedJob(staleClaim, { question: 'Stale', answer: 'Stale', noChange: false });
    assert.equal((await prisma.gameFaqTranslation.findUniqueOrThrow({ where: { faqId_locale: { faqId: faq.id, locale: 'es' } } })).sourceRevision, 1);
    assert.equal((await prisma.gameFaqTranslationJob.findUniqueOrThrow({ where: { id: pending.id } })).status, 'superseded');
    const snap3 = (await FaqTranslationService.status(game.id)).snapshot;
    await FaqTranslationService.submit(game.id, owner.id, false, { targetLocales: ['es'], sourceLocaleOverride: 'en', expectedSnapshot: snap3 }, false);
    await FaqTranslationService.submit(game.id, owner.id, false, { targetLocales: ['es'], sourceLocaleOverride: 'ru', expectedSnapshot: snap3 }, false);
    await FaqTranslationService.submit(game.id, owner.id, false, { targetLocales: ['es'], sourceLocaleOverride: 'en', expectedSnapshot: snap3 }, false);
    assert.equal((await prisma.gameFaqTranslationPreference.findUniqueOrThrow({ where: { gameId: game.id } })).sourceLocaleOverride, 'en');
    await rejectStatus(() => FaqTranslationService.submit(game.id, owner.id, false, { targetLocales: ['es'], sourceLocaleOverride: 'ru', expectedSnapshot: snap3 }, true), 400);
    const enJob = await prisma.gameFaqTranslationJob.findFirstOrThrow({ where: { faqId: faq.id, sourceRevision: 3, sourceLocaleOverride: 'en', targetLocale: 'es' } });
    await prisma.gameFaqTranslationJob.update({ where: { id: enJob.id }, data: { status: 'failed', attempts: 5 } });
    const retried = await FaqTranslationService.submit(game.id, owner.id, false, { targetLocales: ['es'], sourceLocaleOverride: 'en', expectedSnapshot: snap3 }, true);
    assert.equal(retried.queued, 1);
    assert.equal((await prisma.gameFaqTranslationJob.findUniqueOrThrow({ where: { id: enJob.id } })).attempts, 0);
    const finalClaim = await FaqTranslationQueueService.claimJobById(enJob.id);
    assert.ok(finalClaim);
    await prisma.gameFaqTranslationJob.update({ where: { id: enJob.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    await FaqTranslationQueueService.publishClaimedJob(finalClaim, { question: 'Expired', answer: 'Expired', noChange: false });
    assert.equal((await prisma.gameFaqTranslation.findUniqueOrThrow({ where: { faqId_locale: { faqId: faq.id, locale: 'es' } } })).sourceRevision, 1);
    assert.equal(FAQ_TRANSLATION_POLICY_VERSION, 1);

    // This invalid source/target pair fails before the AI call. A deterministic
    // validation failure gets one retry, not the provider's full retry budget.
    const latestFaq = await prisma.gameFaq.findUniqueOrThrow({ where: { id: faq.id } });
    const invalidJob = await prisma.gameFaqTranslationJob.create({ data: {
      faqId: faq.id, targetLocale: 'en', sourceRevision: latestFaq.sourceRevision,
      policyVersion: FAQ_TRANSLATION_POLICY_VERSION, sourceLocaleOverride: 'en',
      questionSnapshot: latestFaq.question, answerSnapshot: latestFaq.answer, requestedBy: owner.id,
    } });
    for (let attempt = 1; attempt <= 2; attempt++) {
      const invalidClaim = await FaqTranslationQueueService.claimJobById(invalidJob.id);
      assert.ok(invalidClaim);
      await FaqTranslationQueueService.runClaimedJob(invalidClaim);
      const result = await prisma.gameFaqTranslationJob.findUniqueOrThrow({ where: { id: invalidJob.id } });
      assert.equal(result.attempts, attempt);
      assert.equal(result.errorCategory, 'validation');
      assert.equal(result.status, attempt === 1 ? 'pending' : 'failed');
      if (attempt === 1) await prisma.gameFaqTranslationJob.update({ where: { id: invalidJob.id }, data: { runAfter: new Date(Date.now() - 1000) } });
    }

    for (const target of [bulkGame, secondBulkGame]) {
      await prisma.gameFaq.createMany({ data: Array.from({ length: 23 }, (_, order) => ({ gameId: target.id, question: `Bulk question ${order + 1}?`, answer: `Bulk answer ${order + 1}.`, order })) });
    }
    await prisma.gameFaq.createMany({ data: Array.from({ length: 91 }, (_, order) => ({ gameId: oversizedGame.id, question: `Oversized question ${order + 1}?`, answer: `Oversized answer ${order + 1}.`, order })) });
    const oversizedSnapshot = (await FaqTranslationService.status(oversizedGame.id)).snapshot;
    await rejectStatus(() => FaqTranslationService.submit(oversizedGame.id, bulkOwner.id, false, { targetLocales: [...APP_UI_LANGUAGES], sourceLocaleOverride: null, expectedSnapshot: oversizedSnapshot }, false), 400);
    assert.equal(await prisma.gameFaqTranslationJob.count({ where: { faq: { gameId: oversizedGame.id } } }), 0);
    assert.equal(await prisma.gameFaqTranslationPreference.findUnique({ where: { gameId: oversizedGame.id } }), null);
    const bulkSnapshot = (await FaqTranslationService.status(bulkGame.id)).snapshot;
    const bulkBody = { targetLocales: [...APP_UI_LANGUAGES], sourceLocaleOverride: null, expectedSnapshot: bulkSnapshot };
    const firstBulk = await FaqTranslationService.submit(bulkGame.id, bulkOwner.id, false, bulkBody, false);
    assert.equal(firstBulk.queued, 253);
    const repeatedBulk = await FaqTranslationService.submit(bulkGame.id, bulkOwner.id, false, bulkBody, false);
    assert.equal(repeatedBulk.queued, 0);
    const secondSnapshot = (await FaqTranslationService.status(secondBulkGame.id)).snapshot;
    await rejectStatus(() => FaqTranslationService.submit(secondBulkGame.id, bulkOwner.id, false, { ...bulkBody, expectedSnapshot: secondSnapshot }, false), 429);
    assert.equal(await prisma.gameFaqTranslationPreference.findUnique({ where: { gameId: secondBulkGame.id } }), null);

    // Reader demand uses no organizer setting and can publish with no preference row.
    await assertCanReadGameFaq(secondBulkGame.id, stranger.id, false);
    const readerFirst = await FaqTranslationService.requestReaderLocale(secondBulkGame.id, stranger.id, false, { locale: 'es' });
    assert.equal(readerFirst.queued, 23);
    const readerAgain = await FaqTranslationService.requestReaderLocale(secondBulkGame.id, stranger.id, false, { locale: 'es' });
    assert.equal(readerAgain.queued, 0);
    assert.equal(await prisma.gameFaqTranslationPreference.findUnique({ where: { gameId: secondBulkGame.id } }), null);
    const readerJob = await prisma.gameFaqTranslationJob.findFirstOrThrow({ where: { faq: { gameId: secondBulkGame.id }, targetLocale: 'es' } });
    const readerClaim = await FaqTranslationQueueService.claimJobById(readerJob.id);
    assert.ok(readerClaim);
    await FaqTranslationQueueService.publishClaimedJob(readerClaim, { question: 'Pregunta traducida', answer: 'Respuesta traducida', noChange: false });
    assert.equal((await prisma.gameFaqTranslationJob.findUniqueOrThrow({ where: { id: readerJob.id } })).status, 'done');

    const ownerPreferenceBeforeReader = await prisma.gameFaqTranslationPreference.findUniqueOrThrow({ where: { gameId: game.id } });
    const viewerJa = await FaqTranslationService.requestReaderLocale(game.id, stranger.id, false, { locale: 'ja' });
    assert.equal(viewerJa.queued, 1);
    assert.equal((await FaqTranslationService.requestReaderLocale(game.id, stranger.id, false, { locale: 'ja' })).queued, 0);
    assert.deepEqual(await prisma.gameFaqTranslationPreference.findUniqueOrThrow({ where: { gameId: game.id } }), ownerPreferenceBeforeReader);
    const jaJob = await prisma.gameFaqTranslationJob.findFirstOrThrow({ where: { faqId: faq.id, targetLocale: 'ja' } });
    await prisma.gameFaqTranslationJob.update({ where: { id: jaJob.id }, data: { status: 'failed', attempts: 5 } });
    assert.equal((await FaqTranslationService.requestReaderLocale(game.id, stranger.id, false, { locale: 'ja' })).queued, 0);
    assert.equal((await FaqTranslationService.requestReaderLocale(game.id, stranger.id, false, { locale: 'ja', retry: true })).queued, 1);
    assert.equal((await FaqTranslationService.requestReaderLocale(game.id, stranger.id, false, { locale: 'en' })).queued, 0);
    assert.equal((await FaqTranslationService.status(game.id)).locales.find(l => l.locale === 'en')?.ready, 1);
    await prisma.game.update({ where: { id: game.id }, data: { status: 'ARCHIVED' } });
    await assertCanReadGameFaq(game.id, stranger.id, false);
    assert.equal((await FaqTranslationService.requestReaderLocale(game.id, stranger.id, false, { locale: 'th' })).queued, 1);
    await rejectStatus(() => FaqTranslationService.submit(game.id, owner.id, false, { targetLocales: ['es'], sourceLocaleOverride: 'en', expectedSnapshot: snap3 }, false), 400);
    await prisma.game.update({ where: { id: game.id }, data: { entityType: 'EVENT', eventApprovalStatus: 'ON_APPROVE' } });
    await rejectStatus(() => assertCanReadGameFaq(game.id, stranger.id, false), 404);
    await rejectStatus(() => FaqTranslationService.requestReaderLocale(game.id, stranger.id, false, { locale: 'ar' }), 404);
    await assertCanReadGameFaq(game.id, owner.id, false);
    await assertCanReadGameFaq(game.id, stranger.id, true);
    console.log('faqTranslation.integration.test.ts: ok');
  } finally {
    await prisma.game.deleteMany({ where: { id: { in: [game.id, bulkGame.id, secondBulkGame.id, oversizedGame.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id, bulkOwner.id] } } });
    await prisma.city.delete({ where: { id: city.id } });
    (config.ai as { provider: 'openai' | 'deepseek' }).provider = originalProvider;
    (config.openai as { apiKey: string }).apiKey = originalKey;
    await prisma.$disconnect();
  }
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
