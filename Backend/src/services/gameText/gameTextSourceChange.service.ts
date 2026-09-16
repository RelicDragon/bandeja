import { Prisma } from '@prisma/client';
import { isGameTextLocalizationGenerationEnabled } from '../../config/env';
import {
  GAME_TEXT_TRANSLATION_JOB_DEBOUNCE_MS,
  planGameTextSourceChange,
  type GameTextSourceChangePlan,
} from './gameTextSourceChange.policy';
import {
  GAME_TEXT_NAME_PROVENANCE_GENERATED_FIXTURE,
  type GameTextNameProvenance,
} from './gameTextWriterAudit';

/** Prisma client or interactive transaction — same delegates for game-text tables. */
export type GameTextDb = Pick<
  Prisma.TransactionClient,
  | 'gameTextSourceMeta'
  | 'gameTextTranslation'
  | 'gameTextTranslationJob'
  | 'gameTextTranslationCorrection'
>;

export type ApplyGameTextSourceChangeInput = {
  gameId: string;
  previousName: string | null | undefined;
  previousDescription: string | null | undefined;
  /** undefined = field not part of this write */
  nextName?: string | null;
  nextDescription?: string | null;
  keepOriginalNameInAllLocales?: boolean;
  /**
   * Defaults to config/env GAME_TEXT_LOCALIZATION_GENERATION_ENABLED.
   * Forced false when nameProvenance is generated_fixture.
   */
  enqueueJobs?: boolean;
  /** Structured provenance — generated fixtures never AI-enqueue. */
  nameProvenance?: GameTextNameProvenance;
  now?: Date;
  debounceMs?: number;
  /** Defaults to every app locale; narrow it for scoped backfills and tests. */
  locales?: readonly string[];
};

export type ApplyGameTextSourceChangeResult = GameTextSourceChangePlan & {
  jobsCreated: number;
  pendingSuperseded: number;
  overridesRetired: number;
  /** Always false — helper never writes Game.name / Game.description. */
  mutatedGameTextColumns: false;
};

/**
 * Record source-revision bumps and schedule GameTextTranslationJob rows inside an
 * existing Prisma transaction (same commit as Game name/description).
 * Does not call AI, Redis, or rewrite Game.name / Game.description.
 */
export async function applyGameTextSourceChangeInTransaction(
  tx: GameTextDb,
  input: ApplyGameTextSourceChangeInput,
): Promise<ApplyGameTextSourceChangeResult> {
  const nameInPatch = Object.prototype.hasOwnProperty.call(input, 'nextName');
  const descriptionInPatch = Object.prototype.hasOwnProperty.call(
    input,
    'nextDescription',
  );

  const existingMeta = await tx.gameTextSourceMeta.findUnique({
    where: { gameId: input.gameId },
  });

  const keepOriginalNameInAllLocales =
    input.keepOriginalNameInAllLocales ??
    existingMeta?.keepOriginalNameInAllLocales ??
    false;
  const keepOriginalNameFlippedOn =
    keepOriginalNameInAllLocales &&
    !(existingMeta?.keepOriginalNameInAllLocales ?? false);

  const isGeneratedFixture =
    input.nameProvenance === GAME_TEXT_NAME_PROVENANCE_GENERATED_FIXTURE;
  const enqueueJobs = isGeneratedFixture
    ? false
    : (input.enqueueJobs ?? isGameTextLocalizationGenerationEnabled());

  const plan = planGameTextSourceChange({
    previousName: input.previousName,
    previousDescription: input.previousDescription,
    nextName: input.nextName,
    nextDescription: input.nextDescription,
    nameInPatch,
    descriptionInPatch,
    previousNameSourceRevision: existingMeta?.nameSourceRevision ?? 0,
    previousDescriptionSourceRevision:
      existingMeta?.descriptionSourceRevision ?? 0,
    keepOriginalNameInAllLocales,
    enqueueJobs,
    locales: input.locales,
  });

  if (!plan.shouldUpsertMeta && !plan.shouldEnqueueJobs) {
    return {
      ...plan,
      jobsCreated: 0,
      pendingSuperseded: 0,
      overridesRetired: 0,
      mutatedGameTextColumns: false,
    };
  }

  if (plan.shouldUpsertMeta) {
    await tx.gameTextSourceMeta.upsert({
      where: { gameId: input.gameId },
      create: {
        gameId: input.gameId,
        nameSourceRevision: plan.nameSourceRevision,
        descriptionSourceRevision: plan.descriptionSourceRevision,
        keepOriginalNameInAllLocales: plan.keepOriginalNameInAllLocales,
      },
      update: {
        nameSourceRevision: plan.nameSourceRevision,
        descriptionSourceRevision: plan.descriptionSourceRevision,
        keepOriginalNameInAllLocales: plan.keepOriginalNameInAllLocales,
      },
    });
  } else if (
    keepOriginalNameFlippedOn ||
    (Object.prototype.hasOwnProperty.call(input, 'keepOriginalNameInAllLocales') &&
      keepOriginalNameInAllLocales !== (existingMeta?.keepOriginalNameInAllLocales ?? false))
  ) {
    await tx.gameTextSourceMeta.upsert({
      where: { gameId: input.gameId },
      create: {
        gameId: input.gameId,
        nameSourceRevision: plan.nameSourceRevision,
        descriptionSourceRevision: plan.descriptionSourceRevision,
        keepOriginalNameInAllLocales,
      },
      update: { keepOriginalNameInAllLocales },
    });
  }

  if (keepOriginalNameFlippedOn) {
    await tx.gameTextTranslation.updateMany({
      where: { gameId: input.gameId, field: 'name' },
      data: {
        automaticText: null,
        generationState: 'not_needed',
        provenance: 'preserved_name',
        manualOverrideText: null,
        manualOverrideSourceRevision: null,
        manualOverrideEditedBy: null,
        manualOverrideEditedAt: null,
        recordRevision: { increment: 1 },
      },
    });
  }

  let overridesRetired = 0;
  if (plan.nameChanged) {
    overridesRetired += await retireFieldTranslationsOnSourceBump(tx, {
      gameId: input.gameId,
      field: 'name',
      sourceRevision: plan.nameSourceRevision,
      previousSourceText: input.previousName ?? null,
      cleared: plan.nameCleared,
    });
  }
  if (plan.descriptionChanged) {
    overridesRetired += await retireFieldTranslationsOnSourceBump(tx, {
      gameId: input.gameId,
      field: 'description',
      sourceRevision: plan.descriptionSourceRevision,
      previousSourceText: input.previousDescription ?? null,
      cleared: plan.descriptionCleared,
    });
  }

  let pendingSuperseded = 0;
  if (plan.nameChanged || plan.descriptionChanged) {
    const superseded = await tx.gameTextTranslationJob.updateMany({
      where: {
        gameId: input.gameId,
        status: 'pending',
        OR: [
          { nameSourceRevision: { not: plan.nameSourceRevision } },
          { descriptionSourceRevision: { not: plan.descriptionSourceRevision } },
        ],
      },
      data: { status: 'superseded' },
    });
    pendingSuperseded = superseded.count;
  }

  let jobsCreated = 0;
  if (plan.shouldEnqueueJobs) {
    const now = input.now ?? new Date();
    const debounceMs = input.debounceMs ?? GAME_TEXT_TRANSLATION_JOB_DEBOUNCE_MS;
    const runAfter = new Date(now.getTime() + debounceMs);

    for (const targetLocale of plan.locales) {
      await tx.gameTextTranslationJob.create({
        data: {
          gameId: input.gameId,
          targetLocale,
          nameSourceRevision: plan.nameSourceRevision,
          descriptionSourceRevision: plan.descriptionSourceRevision,
          policyVersion: plan.policyVersion,
          includeName: plan.includeName,
          includeDescription: plan.includeDescription,
          status: 'pending',
          runAfter,
        },
      });
      jobsCreated += 1;
    }
  }

  return {
    ...plan,
    jobsCreated,
    pendingSuperseded,
    overridesRetired,
    mutatedGameTextColumns: false,
  };
}

/**
 * Stop serving stale automatic + manual text for a field after its source revision bumps.
 * Manual overrides move to GameTextTranslationCorrection (supersededAt null = needs review).
 */
async function retireFieldTranslationsOnSourceBump(
  tx: GameTextDb,
  args: {
    gameId: string;
    field: 'name' | 'description';
    sourceRevision: number;
    previousSourceText: string | null;
    cleared: boolean;
  },
): Promise<number> {
  const withOverrides = await tx.gameTextTranslation.findMany({
    where: {
      gameId: args.gameId,
      field: args.field,
      manualOverrideText: { not: null },
    },
  });

  let retired = 0;
  for (const row of withOverrides) {
    if (!row.manualOverrideText || !row.manualOverrideEditedBy) {
      continue;
    }
    await tx.gameTextTranslationCorrection.create({
      data: {
        gameId: args.gameId,
        field: args.field,
        locale: row.locale,
        sourceRevision: row.manualOverrideSourceRevision ?? row.sourceRevision,
        correctedText: row.manualOverrideText,
        sourceTextSnapshot: args.previousSourceText,
        previousAutomaticText: row.automaticText,
        editedBy: row.manualOverrideEditedBy,
        // null supersededAt = Needs review until organizer confirms/discards
        supersededAt: null,
      },
    });
    retired += 1;
  }

  await tx.gameTextTranslation.updateMany({
    where: { gameId: args.gameId, field: args.field },
    data: {
      automaticText: null,
      sourceRevision: args.sourceRevision,
      generationState: args.cleared ? 'not_needed' : 'pending',
      provenance: args.cleared ? 'empty_source' : null,
      manualOverrideText: null,
      manualOverrideSourceRevision: null,
      manualOverrideEditedBy: null,
      manualOverrideEditedAt: null,
      recordRevision: { increment: 1 },
    },
  });

  return retired;
}
