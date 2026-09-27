import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Prisma, type GameFaqTranslationJob } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { FAQ_TRANSLATION_POLICY_VERSION, FaqTranslationError, translateFaqPair } from './faqTranslator.service';
import { isFaqGenerationAvailable } from './faqTranslation.service';

const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
let timer: ReturnType<typeof setInterval> | null = null;
let active = 0;
let draining = false;
let running = false;
const MAX_ERROR_LENGTH = 500;

type Claim = { job: GameFaqTranslationJob; token: bigint };

function retryDelay(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** attempts) + Math.floor(Math.random() * 500);
}

export class FaqTranslationQueueService {
  static startWorker(): void {
    if (timer) return;
    running = true;
    timer = setInterval(() => void this.drain().catch(error => console.error('[faq-translation] drain failed', error)), config.faqTranslation.pollIntervalMs);
    void this.drain().catch(error => console.error('[faq-translation] drain failed', error));
  }

  static stopWorker(): void {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
  }

  static wake(): void { if (running) void this.drain().catch(error => console.error('[faq-translation] drain failed', error)); }

  static async drain(): Promise<void> {
    if (!running || draining || !isFaqGenerationAvailable()) return;
    draining = true;
    try {
      while (active < config.faqTranslation.concurrency) {
        const claim = await this.claimNextJob();
        if (!claim) break;
        active++;
        void this.runClaimedJob(claim).catch(error => console.error('[faq-translation] job error', error)).finally(() => { active--; if (running) this.wake(); });
      }
    } finally { draining = false; }
  }

  static async claimNextJob(): Promise<Claim | null> {
    const now = new Date();
    const candidates = await prisma.gameFaqTranslationJob.findMany({
      where: { OR: [
        { status: 'pending', runAfter: { lte: now } },
        { status: 'running', leaseExpiresAt: { lt: now } },
      ] },
      orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }], take: 20,
    });
    for (const candidate of candidates) {
      if (candidate.attempts >= config.faqTranslation.maxAttempts) {
        await prisma.gameFaqTranslationJob.updateMany({ where: { id: candidate.id, claimToken: candidate.claimToken, status: candidate.status }, data: { status: 'failed', leaseOwner: null, leaseExpiresAt: null, lastError: 'Worker lease expired too many times', errorCategory: 'transient' } });
        continue;
      }
      const changed = await prisma.gameFaqTranslationJob.updateMany({
        where: { id: candidate.id, claimToken: candidate.claimToken, OR: [
          { status: 'pending', runAfter: { lte: now } },
          { status: 'running', leaseExpiresAt: { lt: now } },
        ] },
        data: { status: 'running', leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + config.faqTranslation.leaseMs), claimToken: { increment: 1 }, attempts: { increment: 1 }, lastError: null, errorCategory: null },
      });
      if (changed.count !== 1) continue;
      const job = await prisma.gameFaqTranslationJob.findUnique({ where: { id: candidate.id } });
      if (job?.leaseOwner === workerId && job.status === 'running') return { job, token: job.claimToken };
    }
    return null;
  }

  static async claimJobById(jobId: string): Promise<Claim | null> {
    const candidate = await prisma.gameFaqTranslationJob.findUnique({ where: { id: jobId } });
    if (!candidate) return null;
    const now = new Date();
    if (!((candidate.status === 'pending' && candidate.runAfter <= now) || (candidate.status === 'running' && candidate.leaseExpiresAt && candidate.leaseExpiresAt < now))) return null;
    if (candidate.attempts >= config.faqTranslation.maxAttempts) {
      await prisma.gameFaqTranslationJob.updateMany({ where: { id: jobId, claimToken: candidate.claimToken, status: candidate.status }, data: { status: 'failed', leaseOwner: null, leaseExpiresAt: null, lastError: 'Worker lease expired too many times', errorCategory: 'transient' } });
      return null;
    }
    const changed = await prisma.gameFaqTranslationJob.updateMany({ where: { id: jobId, claimToken: candidate.claimToken, OR: [
      { status: 'pending', runAfter: { lte: now } }, { status: 'running', leaseExpiresAt: { lt: now } },
    ] }, data: { status: 'running', leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + config.faqTranslation.leaseMs), claimToken: { increment: 1 }, attempts: { increment: 1 }, lastError: null, errorCategory: null } });
    if (changed.count !== 1) return null;
    const job = await prisma.gameFaqTranslationJob.findUnique({ where: { id: jobId } });
    return job?.leaseOwner === workerId && job.status === 'running' ? { job, token: job.claimToken } : null;
  }

  static async runClaimedJob({ job, token }: Claim): Promise<void> {
    const fence = () => ({ id: job.id, status: 'running' as const, claimToken: token, leaseOwner: workerId, leaseExpiresAt: { gt: new Date() } });
    try {
      if (!isFaqGenerationAvailable()) {
        await prisma.gameFaqTranslationJob.updateMany({ where: fence(), data: { status: 'pending', leaseOwner: null, leaseExpiresAt: null, runAfter: new Date(Date.now() + 60_000) } });
        return;
      }
      const faq = await prisma.gameFaq.findUnique({ where: { id: job.faqId }, select: { sourceRevision: true, question: true, answer: true, gameId: true } });
      const preference = faq ? await prisma.gameFaqTranslationPreference.findUnique({ where: { gameId: faq.gameId } }) : null;
      if (!faq || faq.sourceRevision !== job.sourceRevision || faq.question !== job.questionSnapshot || faq.answer !== job.answerSnapshot || (preference?.sourceLocaleOverride ?? null) !== (job.sourceLocaleOverride || null) || job.policyVersion !== FAQ_TRANSLATION_POLICY_VERSION) {
        await prisma.gameFaqTranslationJob.updateMany({ where: fence(), data: { status: 'superseded', leaseOwner: null, leaseExpiresAt: null } });
        return;
      }
      const translated = await translateFaqPair({ question: job.questionSnapshot, answer: job.answerSnapshot, targetLocale: job.targetLocale, sourceLocaleOverride: job.sourceLocaleOverride || null, userId: job.requestedBy });
      await this.publishClaimedJob({ job, token }, translated);
    } catch (error) {
      const attempts = job.attempts;
      const category = error instanceof FaqTranslationError
        ? error.category
        : 'transient';
      const retry = attempts < (category === 'validation' ? Math.min(2, config.faqTranslation.maxAttempts) : config.faqTranslation.maxAttempts);
      const message = error instanceof Error ? error.message : String(error);
      await prisma.gameFaqTranslationJob.updateMany({ where: fence(), data: {
        status: retry ? 'pending' : 'failed',
        runAfter: new Date(Date.now() + retryDelay(attempts)),
        errorCategory: category,
        lastError: message.slice(0, MAX_ERROR_LENGTH), leaseOwner: null, leaseExpiresAt: null,
      } });
    }
  }

  /** Publish a complete pair under the same fence used by the worker. */
  static async publishClaimedJob({ job, token }: Claim, translated: { question: string; answer: string; noChange: boolean }): Promise<void> {
    const fence = () => ({ id: job.id, status: 'running' as const, claimToken: token, leaseOwner: workerId, leaseExpiresAt: { gt: new Date() } });
      // The source, preference, and fence are checked in the publication transaction.
      // Serializable isolation makes this exclusive with a concurrent FAQ source edit.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await prisma.$transaction(async tx => {
            const current = await tx.gameFaq.findUnique({ where: { id: job.faqId }, select: { gameId: true, sourceRevision: true, question: true, answer: true } });
            const currentPreference = current ? await tx.gameFaqTranslationPreference.findUnique({ where: { gameId: current.gameId } }) : null;
            const owned = await tx.gameFaqTranslationJob.findFirst({ where: fence(), select: { id: true } });
            if (!owned) return;
            if (!current || current.sourceRevision !== job.sourceRevision || current.question !== job.questionSnapshot || current.answer !== job.answerSnapshot || (currentPreference?.sourceLocaleOverride ?? null) !== (job.sourceLocaleOverride || null) || job.policyVersion !== FAQ_TRANSLATION_POLICY_VERSION) {
              await tx.gameFaqTranslationJob.updateMany({ where: fence(), data: { status: 'superseded', leaseOwner: null, leaseExpiresAt: null } });
              return;
            }
            const completion = await tx.gameFaqTranslationJob.updateMany({ where: fence(), data: { status: 'done', leaseOwner: null, leaseExpiresAt: null } });
            if (completion.count !== 1) return;
            await tx.gameFaqTranslation.upsert({
              where: { faqId_locale: { faqId: job.faqId, locale: job.targetLocale } },
              create: { faqId: job.faqId, locale: job.targetLocale, sourceRevision: job.sourceRevision, policyVersion: job.policyVersion, sourceLocaleOverride: job.sourceLocaleOverride || null, question: translated.question, answer: translated.answer, noChange: translated.noChange },
              update: { sourceRevision: job.sourceRevision, policyVersion: job.policyVersion, sourceLocaleOverride: job.sourceLocaleOverride || null, question: translated.question, answer: translated.answer, noChange: translated.noChange },
            });
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
          return;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 3) continue;
          throw error;
        }
      }
  }
}
