import { createHash } from 'node:crypto';
import { APP_UI_LANGUAGES, isAppUiLanguage } from '@bandeja/app-locale';
import { ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';
import { FAQ_TRANSLATION_POLICY_VERSION } from './faqTranslator.service';
import { getAiService } from '../ai/ai.service';
import { lockFaqGame } from './faqGameLock';
import { assertCanReadGameFaq } from './faqReadAccess';

export const FAQ_QUESTION_MAX = 5_000;
export const FAQ_ANSWER_MAX = 20_000;
const MAX_ACTIVE_GAME_JOBS = 250;
const MAX_ACTIVE_USER_JOBS = 500;
const MAX_BATCH_JOBS = 1_000;
export const isFaqGenerationAvailable = () => config.faqTranslation.enabled && getAiService().isConfigured();

type Db = Prisma.TransactionClient;
type Faq = { id: string; question: string; answer: string; sourceRevision: number };
type Submission = { targetLocales: string[]; sourceLocaleOverride: string | null; expectedSnapshot: string };

function validateReaderRequest(value: unknown): { locale: string; retry: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid FAQ language request');
  const body = value as Record<string, unknown>;
  if (typeof body.locale !== 'string' || !isAppUiLanguage(body.locale)) throw new ApiError(400, 'Choose a supported app language');
  if (body.retry !== undefined && typeof body.retry !== 'boolean') throw new ApiError(400, 'Invalid retry option');
  return { locale: body.locale, retry: body.retry === true };
}

function snapshot(faqs: Faq[]): string {
  const stable = faqs.map(({ id, sourceRevision }) => [id, sourceRevision]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function validateSubmission(value: unknown): Submission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid translation request');
  const body = value as Record<string, unknown>;
  const locales = body.targetLocales;
  if (!Array.isArray(locales) || locales.length === 0 || locales.length > APP_UI_LANGUAGES.length ||
      locales.some(locale => typeof locale !== 'string' || !isAppUiLanguage(locale)) ||
      new Set(locales).size !== locales.length) throw new ApiError(400, 'Choose one or more distinct app languages');
  const override = body.sourceLocaleOverride;
  if (override !== null && (typeof override !== 'string' || !isAppUiLanguage(override))) throw new ApiError(400, 'Invalid source language');
  if (override && locales.includes(override)) throw new ApiError(400, 'Source language cannot be a target');
  if (typeof body.expectedSnapshot !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedSnapshot)) throw new ApiError(400, 'Invalid FAQ snapshot');
  return { targetLocales: locales, sourceLocaleOverride: override, expectedSnapshot: body.expectedSnapshot };
}

function isCurrent(t: { sourceRevision: number; policyVersion: number; sourceLocaleOverride: string | null }, faq: Faq, override: string | null) {
  return t.sourceRevision === faq.sourceRevision && t.policyVersion === FAQ_TRANSLATION_POLICY_VERSION && t.sourceLocaleOverride === override;
}

export class FaqTranslationService {
  static async status(gameId: string) {
    const [faqs, preference] = await Promise.all([
      prisma.gameFaq.findMany({ where: { gameId }, select: { id: true, question: true, answer: true, sourceRevision: true } }),
      prisma.gameFaqTranslationPreference.findUnique({ where: { gameId } }),
    ]);
    const ids = faqs.map(f => f.id);
    const [translations, jobs] = ids.length ? await Promise.all([
      prisma.gameFaqTranslation.findMany({ where: { faqId: { in: ids } } }),
      prisma.gameFaqTranslationJob.findMany({ where: { faqId: { in: ids }, status: { in: ['pending', 'running', 'failed'] } }, orderBy: { createdAt: 'desc' } }),
    ]) : [[], []];
    const override = preference?.sourceLocaleOverride ?? null;
    const locales = APP_UI_LANGUAGES.map(locale => {
      const result = { locale, ready: 0, pending: 0, failed: 0, stale: 0, missing: 0 };
      if (override === locale) { result.ready = faqs.length; return result; }
      for (const faq of faqs) {
        const translation = translations.find(t => t.faqId === faq.id && t.locale === locale);
        if (translation && isCurrent(translation, faq, override)) { result.ready++; continue; }
        const job = jobs.find(j => j.faqId === faq.id && j.targetLocale === locale && j.sourceRevision === faq.sourceRevision && j.policyVersion === FAQ_TRANSLATION_POLICY_VERSION && j.sourceLocaleOverride === (override ?? ''));
        if (job?.status === 'pending' || job?.status === 'running') result.pending++;
        else if (job?.status === 'failed') result.failed++;
        else if (translation) result.stale++;
        else result.missing++;
      }
      return result;
    });
    return { generationEnabled: isFaqGenerationAvailable(), selectedLocales: preference?.selectedLocales ?? [...APP_UI_LANGUAGES], sourceLocaleOverride: override, snapshot: snapshot(faqs), faqCount: faqs.length, locales };
  }

  /** A reader can request one language without changing organizer preferences. */
  static async requestReaderLocale(gameId: string, userId: string, isAdmin: boolean, payload: unknown) {
    const { locale, retry } = validateReaderRequest(payload);
    await assertCanReadGameFaq(gameId, userId, isAdmin);
    let queued = 0;
    let reused = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await prisma.$transaction(async (tx: Db) => {
          await lockFaqGame(tx, gameId);
          const preference = await tx.gameFaqTranslationPreference.findUnique({ where: { gameId } });
          const sourceOverride = preference?.sourceLocaleOverride ?? null;
          const faqs = await tx.gameFaq.findMany({ where: { gameId }, select: { id: true, question: true, answer: true, sourceRevision: true } });
          if (sourceOverride === locale) { queued = 0; reused = faqs.length; return; }
          const oversized = faqs.filter(f => f.question.length > FAQ_QUESTION_MAX || f.answer.length > FAQ_ANSWER_MAX).map(f => f.id);
          if (oversized.length) throw new ApiError(400, 'Some FAQs exceed translation size limits', true, { faqIds: oversized });
          const [translations, jobs, gameActive, userActive] = await Promise.all([
            tx.gameFaqTranslation.findMany({ where: { faqId: { in: faqs.map(f => f.id) }, locale } }),
            tx.gameFaqTranslationJob.findMany({ where: { faqId: { in: faqs.map(f => f.id) }, targetLocale: locale, sourceLocaleOverride: sourceOverride ?? '', policyVersion: FAQ_TRANSLATION_POLICY_VERSION } }),
            tx.gameFaqTranslationJob.count({ where: { faq: { gameId }, status: { in: ['pending', 'running'] } } }),
            tx.gameFaqTranslationJob.count({ where: { requestedBy: userId, status: { in: ['pending', 'running'] } } }),
          ]);
          const work = faqs.filter(faq => {
            const translation = translations.find(t => t.faqId === faq.id);
            if (translation && isCurrent(translation, faq, sourceOverride)) return false;
            const job = jobs.find(j => j.faqId === faq.id && j.sourceRevision === faq.sourceRevision);
            if (job?.status === 'pending' || job?.status === 'running') return false;
            if (job?.status === 'failed' && !retry) return false;
            return true;
          });
          if (work.length > MAX_BATCH_JOBS) throw new ApiError(400, 'Too many FAQ translations in one request. Select fewer languages or translate fewer FAQs');
          if (work.length && !isFaqGenerationAvailable()) throw new ApiError(503, 'FAQ translation is unavailable');
          const exceedsCapacity = gameActive + work.length > MAX_ACTIVE_GAME_JOBS || userActive + work.length > MAX_ACTIVE_USER_JOBS;
          if (work.length && exceedsCapacity && !(gameActive === 0 && userActive === 0)) throw new ApiError(429, 'Translation queue is busy. Try again after current work finishes');
          queued = 0;
          for (const faq of work) {
            const existing = jobs.find(j => j.faqId === faq.id && j.sourceRevision === faq.sourceRevision);
            if (existing) {
              await tx.gameFaqTranslationJob.update({ where: { id: existing.id }, data: { status: 'pending', attempts: 0, runAfter: new Date(), leaseOwner: null, leaseExpiresAt: null, lastError: null, errorCategory: null, requestedBy: userId } });
            } else {
              await tx.gameFaqTranslationJob.create({ data: {
                faqId: faq.id, targetLocale: locale, sourceRevision: faq.sourceRevision,
                policyVersion: FAQ_TRANSLATION_POLICY_VERSION, sourceLocaleOverride: sourceOverride ?? '',
                questionSnapshot: faq.question, answerSnapshot: faq.answer, requestedBy: userId,
              } });
            }
            queued++;
          }
          reused = faqs.length - queued;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return { ...(await this.status(gameId)), queued, reused };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code) && attempt < 3) continue;
        throw error;
      }
    }
    throw new ApiError(429, 'Translation queue is busy. Try again');
  }

  static async submit(gameId: string, userId: string, isAdmin: boolean, payload: unknown, retryOnly: boolean) {
    const request = validateSubmission(payload);
    if (!isFaqGenerationAvailable()) throw new ApiError(503, 'FAQ translation is unavailable');
    let queued = 0;
    let reused = 0;
    // Serializable retries make simultaneous submissions and source edits linearizable.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await prisma.$transaction(async (tx: Db) => {
          await lockFaqGame(tx, gameId);
          const game = await tx.game.findUnique({ where: { id: gameId }, select: { status: true } });
          if (!game) throw new ApiError(404, 'Game not found');
          if (game.status === 'ARCHIVED') throw new ApiError(400, 'Cannot modify archived games');
          if (!await hasParentGamePermission(gameId, userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], isAdmin)) throw new ApiError(403, 'Only game owners and admins can translate FAQs');
          const faqs = await tx.gameFaq.findMany({ where: { gameId }, select: { id: true, question: true, answer: true, sourceRevision: true } });
          if (snapshot(faqs) !== request.expectedSnapshot) throw new ApiError(409, 'FAQ content changed. Refresh translations and try again');
          const oversized = faqs.filter(f => f.question.length > FAQ_QUESTION_MAX || f.answer.length > FAQ_ANSWER_MAX).map(f => f.id);
          if (oversized.length) throw new ApiError(400, 'Some FAQs exceed translation size limits', true, { faqIds: oversized });
          const preference = await tx.gameFaqTranslationPreference.findUnique({ where: { gameId } });
          if (!retryOnly && preference?.sourceLocaleOverride !== request.sourceLocaleOverride) {
            await tx.gameFaqTranslationJob.updateMany({ where: { faq: { gameId }, status: { in: ['pending', 'running'] }, sourceLocaleOverride: { not: request.sourceLocaleOverride ?? '' } }, data: { status: 'superseded', leaseOwner: null, leaseExpiresAt: null } });
          }
          const identities = faqs.flatMap(faq => request.targetLocales.map(targetLocale => ({ faq, targetLocale })));
          const [translations, jobs, gameActive, userActive] = await Promise.all([
            tx.gameFaqTranslation.findMany({ where: { faqId: { in: faqs.map(f => f.id) }, locale: { in: request.targetLocales } } }),
            tx.gameFaqTranslationJob.findMany({ where: { faqId: { in: faqs.map(f => f.id) }, targetLocale: { in: request.targetLocales }, sourceLocaleOverride: request.sourceLocaleOverride ?? '', policyVersion: FAQ_TRANSLATION_POLICY_VERSION } }),
            tx.gameFaqTranslationJob.count({ where: { faq: { gameId }, status: { in: ['pending', 'running'] } } }),
            tx.gameFaqTranslationJob.count({ where: { requestedBy: userId, status: { in: ['pending', 'running'] } } }),
          ]);
          if (retryOnly && preference?.sourceLocaleOverride !== request.sourceLocaleOverride) throw new ApiError(400, 'Source language changed. Submit a new translation request');
          const work = identities.filter(({ faq, targetLocale }) => {
            const t = translations.find(t => t.faqId === faq.id && t.locale === targetLocale);
            if (t && isCurrent(t, faq, request.sourceLocaleOverride)) return false;
            const job = jobs.find(j => j.faqId === faq.id && j.targetLocale === targetLocale && j.sourceRevision === faq.sourceRevision);
            return retryOnly ? job?.status === 'failed' : !job || job.status === 'failed' || job.status === 'done' || job.status === 'superseded';
          });
          if (work.length > MAX_BATCH_JOBS) throw new ApiError(400, 'Too many FAQ translations in one request. Select fewer languages or translate fewer FAQs');
          // A first all-language submission can exceed the active-job cap on its own
          // (23 FAQs × 11 languages = 253). Admit that one durable batch when both
          // queues are idle; the worker still executes with bounded concurrency.
          // Subsequent work waits for the batch to drain. Idempotent no-op requests
          // must remain accepted even while the queue is above its usual cap.
          const exceedsCapacity = gameActive + work.length > MAX_ACTIVE_GAME_JOBS || userActive + work.length > MAX_ACTIVE_USER_JOBS;
          const idleBulkAdmission = gameActive === 0 && userActive === 0;
          if (work.length > 0 && exceedsCapacity && !idleBulkAdmission) throw new ApiError(429, 'Translation queue is busy. Try again after current work finishes');
          // Preference update and jobs commit together, after all validation/capacity checks.
          if (!retryOnly || !preference) await tx.gameFaqTranslationPreference.upsert({ where: { gameId }, create: { gameId, selectedLocales: request.targetLocales, sourceLocaleOverride: request.sourceLocaleOverride }, update: { selectedLocales: request.targetLocales, sourceLocaleOverride: request.sourceLocaleOverride } });
          queued = 0;
          for (const { faq, targetLocale } of work) {
            const identity = { faqId: faq.id, targetLocale, sourceRevision: faq.sourceRevision, policyVersion: FAQ_TRANSLATION_POLICY_VERSION, sourceLocaleOverride: request.sourceLocaleOverride ?? '' };
            const existing = jobs.find(j => j.faqId === faq.id && j.targetLocale === targetLocale && j.sourceRevision === faq.sourceRevision);
            if (existing?.status === 'failed' || existing?.status === 'done' || existing?.status === 'superseded') {
              await tx.gameFaqTranslationJob.update({ where: { id: existing.id }, data: { status: 'pending', attempts: 0, runAfter: new Date(), leaseOwner: null, leaseExpiresAt: null, lastError: null, errorCategory: null, requestedBy: userId } });
            } else {
              await tx.gameFaqTranslationJob.create({ data: { ...identity, questionSnapshot: faq.question, answerSnapshot: faq.answer, requestedBy: userId } });
            }
            queued++;
          }
          reused = identities.length - queued;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return { ...(await this.status(gameId)), queued, reused };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code) && attempt < 3) continue;
        throw error;
      }
    }
    throw new ApiError(429, 'Translation queue is busy. Try again');
  }
}
