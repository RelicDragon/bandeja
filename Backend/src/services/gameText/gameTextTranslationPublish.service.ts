import { Prisma } from '@prisma/client';
import type { GameTextField, GameTextProvenance } from '@prisma/client';
import prisma from '../../config/database';
import type { GameTextTranslateFieldResult, GameTextFieldKey } from './gameTextTranslator.service';

export type PublishGameTextTranslationInput = {
  jobId: string;
  /** Fencing token from the successful claim. */
  claimToken: bigint;
  leaseOwner: string;
  expectedNameSourceRevision: number;
  expectedDescriptionSourceRevision: number;
  fields: Partial<Record<GameTextFieldKey, GameTextTranslateFieldResult>>;
};

export type PublishGameTextTranslationResult =
  | { status: 'published'; fields: GameTextFieldKey[] }
  | { status: 'discarded'; reason: 'lease_mismatch' | 'revision_mismatch' | 'job_not_running' };

/**
 * Persist automatic translations only when the claiming worker still owns the lease
 * and game source revisions still match the job. Never rewrites Game.name/description.
 * Never clears or overwrites an active manual override text.
 */
export async function publishGameTextTranslationResult(
  input: PublishGameTextTranslationInput,
): Promise<PublishGameTextTranslationResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT id FROM "GameTextTranslationJob" WHERE id = ${input.jobId} FOR UPDATE`,
    );

    const job = await tx.gameTextTranslationJob.findUnique({
      where: { id: input.jobId },
    });
    if (!job) {
      return { status: 'discarded', reason: 'job_not_running' };
    }
    if (job.status !== 'running') {
      return { status: 'discarded', reason: 'job_not_running' };
    }
    if (
      job.claimToken !== input.claimToken ||
      job.leaseOwner !== input.leaseOwner
    ) {
      return { status: 'discarded', reason: 'lease_mismatch' };
    }

    await tx.$executeRaw(
      Prisma.sql`SELECT id FROM "Game" WHERE id = ${job.gameId} FOR UPDATE`,
    );
    // Touch game row only for lock — never update name/description.
    const game = await tx.game.findUnique({
      where: { id: job.gameId },
      select: { id: true, name: true, description: true },
    });
    if (!game) {
      await markJobDiscarded(tx, job.id, input.claimToken, 'superseded');
      return { status: 'discarded', reason: 'revision_mismatch' };
    }

    const meta = await tx.gameTextSourceMeta.findUnique({
      where: { gameId: job.gameId },
    });
    if (
      !meta ||
      meta.nameSourceRevision !== input.expectedNameSourceRevision ||
      meta.descriptionSourceRevision !== input.expectedDescriptionSourceRevision ||
      meta.nameSourceRevision !== job.nameSourceRevision ||
      meta.descriptionSourceRevision !== job.descriptionSourceRevision
    ) {
      await markJobDiscarded(tx, job.id, input.claimToken, 'superseded');
      return { status: 'discarded', reason: 'revision_mismatch' };
    }

    const published: GameTextFieldKey[] = [];
    for (const field of Object.keys(input.fields) as GameTextFieldKey[]) {
      const result = input.fields[field];
      if (!result) continue;
      const sourceRevision =
        field === 'name' ? job.nameSourceRevision : job.descriptionSourceRevision;
      await upsertAutomaticTranslation(tx, {
        gameId: job.gameId,
        field,
        locale: job.targetLocale,
        sourceRevision,
        automaticText: result.text,
        provenance: result.noChange ? 'same_language' : 'automatic',
      });
      published.push(field);
    }

    const stillOwned = await tx.gameTextTranslationJob.updateMany({
      where: {
        id: job.id,
        claimToken: input.claimToken,
        leaseOwner: input.leaseOwner,
        status: 'running',
      },
      data: {
        status: 'done',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        errorCategory: null,
      },
    });
    if (stillOwned.count !== 1) {
      return { status: 'discarded', reason: 'lease_mismatch' };
    }

    return { status: 'published', fields: published };
  });
}

async function markJobDiscarded(
  tx: Prisma.TransactionClient,
  jobId: string,
  claimToken: bigint,
  status: 'superseded',
): Promise<void> {
  await tx.gameTextTranslationJob.updateMany({
    where: { id: jobId, claimToken, status: 'running' },
    data: {
      status,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
}

async function upsertAutomaticTranslation(
  tx: Prisma.TransactionClient,
  args: {
    gameId: string;
    field: GameTextFieldKey;
    locale: string;
    sourceRevision: number;
    automaticText: string;
    provenance: GameTextProvenance;
  },
): Promise<void> {
  const field = args.field as GameTextField;
  const existing = await tx.gameTextTranslation.findUnique({
    where: {
      gameId_field_locale: {
        gameId: args.gameId,
        field,
        locale: args.locale,
      },
    },
  });

  if (!existing) {
    await tx.gameTextTranslation.create({
      data: {
        gameId: args.gameId,
        field,
        locale: args.locale,
        sourceRevision: args.sourceRevision,
        automaticText: args.automaticText,
        generationState: 'ready',
        provenance: args.provenance,
      },
    });
    return;
  }

  // Preserve active manual override columns; only refresh automatic text + generation state.
  await tx.gameTextTranslation.update({
    where: { id: existing.id },
    data: {
      sourceRevision: args.sourceRevision,
      automaticText: args.automaticText,
      generationState: 'ready',
      provenance:
        existing.manualOverrideText != null &&
        existing.manualOverrideSourceRevision === args.sourceRevision
          ? existing.provenance ?? args.provenance
          : args.provenance,
      recordRevision: { increment: 1 },
    },
  });
}
