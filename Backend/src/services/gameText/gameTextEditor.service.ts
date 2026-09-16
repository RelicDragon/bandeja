import {
  APP_UI_LANGUAGES,
  GAME_TEXT_TRANSLATION_POLICY_VERSION,
  isAppUiLanguage,
  normalizeAppUiLanguage,
  type AppUiLanguage,
} from '@bandeja/app-locale';
import {
  GameStatus,
  ParticipantRole,
  type GameTextField,
  type Prisma,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';
import { normalizeAuthoredGameText } from './gameTextAuthoredText';
import {
  resolveGameTextEditorLocaleStatus,
  type GameTextEditorLocaleStatus,
} from './gameTextEditor.status';
import { GAME_TEXT_TRANSLATION_JOB_DEBOUNCE_MS } from './gameTextSourceChange.policy';
import { wakeGameTextTranslationWorker } from './gameTextTranslationWake';
import { publishGameTextInvalidation } from './gameTextRealtime';

export type GameTextEditorFieldPatch = {
  action: 'set' | 'clear';
  /** Required when action is set. */
  text?: string | null;
  expectedSourceRevision: number;
  /** null when no GameTextTranslation row exists yet. */
  expectedRecordRevision: number | null;
};

export type PatchGameTextTranslationInput = {
  gameId: string;
  locale: string;
  editorUserId: string;
  name?: GameTextEditorFieldPatch;
  description?: GameTextEditorFieldPatch;
};

export type RetryGameTextTranslationInput = {
  gameId: string;
  locale: string;
};

export type GameTextPolicyUpdateInput = {
  gameId: string;
  keepOriginalNameInAllLocales?: boolean;
  nameSourceLocaleOverride?: string | null;
  descriptionSourceLocaleOverride?: string | null;
  enqueueJobs?: boolean;
};

export type GameTextEditorFieldDto = {
  field: 'name' | 'description';
  original: string | null;
  sourceRevision: number;
  effectiveText: string | null;
  automaticText: string | null;
  generationState: string | null;
  provenance: string | null;
  hasActiveCorrection: boolean;
  needsReview: boolean;
  reviewCorrectionText: string | null;
  recordRevision: number | null;
  preserveAsOriginal: boolean;
};

export type GameTextEditorLocaleDto = {
  locale: AppUiLanguage;
  status: GameTextEditorLocaleStatus;
  name: GameTextEditorFieldDto;
  description: GameTextEditorFieldDto;
};

export type GameTextTranslationsEditorDto = {
  gameId: string;
  name: string | null;
  description: string | null;
  meta: {
    nameSourceRevision: number;
    descriptionSourceRevision: number;
    keepOriginalNameInAllLocales: boolean;
    nameSourceLocaleOverride: string | null;
    descriptionSourceLocaleOverride: string | null;
  };
  locales: GameTextEditorLocaleDto[];
};

type Tx = Pick<
  Prisma.TransactionClient,
  | 'game'
  | 'gameTextSourceMeta'
  | 'gameTextTranslation'
  | 'gameTextTranslationCorrection'
  | 'gameTextTranslationJob'
>;

export async function assertCanEditGameTextTranslations(
  gameId: string,
  userId: string,
  isAdmin = false,
): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, status: true },
  });
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }
  if (game.status === GameStatus.ARCHIVED) {
    throw new ApiError(400, 'Cannot modify archived games');
  }
  const allowed = await hasParentGamePermission(
    gameId,
    userId,
    [ParticipantRole.OWNER, ParticipantRole.ADMIN],
    isAdmin,
  );
  if (!allowed) {
    throw new ApiError(403, 'Only game owners or admins can perform this action');
  }
}

function normalizeEditorLocale(locale: string): AppUiLanguage {
  const code = locale.trim().toLowerCase();
  if (!isAppUiLanguage(code)) {
    throw new ApiError(400, 'Unsupported translation locale');
  }
  return code;
}

function optionalLocaleOverride(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'auto') return null;
  return normalizeAppUiLanguage(trimmed);
}

export async function listGameTextTranslations(
  gameId: string,
): Promise<GameTextTranslationsEditorDto> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, name: true, description: true },
  });
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const [meta, rows, corrections, jobs] = await Promise.all([
    prisma.gameTextSourceMeta.findUnique({ where: { gameId } }),
    prisma.gameTextTranslation.findMany({ where: { gameId } }),
    prisma.gameTextTranslationCorrection.findMany({
      where: { gameId, supersededAt: null },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.gameTextTranslationJob.findMany({
      where: {
        gameId,
        status: { in: ['pending', 'running'] },
      },
    }),
  ]);

  const nameSourceRevision = meta?.nameSourceRevision ?? 0;
  const descriptionSourceRevision = meta?.descriptionSourceRevision ?? 0;
  const keepOriginalNameInAllLocales = meta?.keepOriginalNameInAllLocales ?? false;
  const originalName = normalizeAuthoredGameText(game.name);
  const originalDescription = normalizeAuthoredGameText(game.description);

  const rowKey = (field: GameTextField, locale: string) => `${field}:${locale}`;
  const rowByKey = new Map(rows.map((r) => [rowKey(r.field, r.locale), r]));
  const reviewByKey = new Map<string, string>();
  for (const c of corrections) {
    const key = rowKey(c.field, c.locale);
    if (!reviewByKey.has(key)) {
      reviewByKey.set(key, c.correctedText);
    }
  }

  const locales: GameTextEditorLocaleDto[] = APP_UI_LANGUAGES.map((locale) => {
    const name = buildFieldDto({
      field: 'name',
      locale,
      original: originalName,
      sourceRevision: nameSourceRevision,
      preserveAsOriginal: keepOriginalNameInAllLocales,
      row: rowByKey.get(rowKey('name', locale)) ?? null,
      reviewText: reviewByKey.get(rowKey('name', locale)) ?? null,
      jobInFlight: jobs.some(
        (j) =>
          j.targetLocale === locale &&
          j.includeName &&
          j.nameSourceRevision === nameSourceRevision,
      ),
    });
    const description = buildFieldDto({
      field: 'description',
      locale,
      original: originalDescription,
      sourceRevision: descriptionSourceRevision,
      preserveAsOriginal: false,
      row: rowByKey.get(rowKey('description', locale)) ?? null,
      reviewText: reviewByKey.get(rowKey('description', locale)) ?? null,
      jobInFlight: jobs.some(
        (j) =>
          j.targetLocale === locale &&
          j.includeDescription &&
          j.descriptionSourceRevision === descriptionSourceRevision,
      ),
    });

    return {
      locale,
      status: resolveGameTextEditorLocaleStatus({
        name: {
          hasOriginal: name.original != null,
          preserveAsOriginal: name.preserveAsOriginal,
          generationState: (name.generationState as never) ?? null,
          hasActiveCorrection: name.hasActiveCorrection,
          needsReview: name.needsReview,
          jobInFlight: jobs.some(
            (j) =>
              j.targetLocale === locale &&
              j.includeName &&
              j.nameSourceRevision === nameSourceRevision,
          ),
        },
        description: {
          hasOriginal: description.original != null,
          preserveAsOriginal: false,
          generationState: (description.generationState as never) ?? null,
          hasActiveCorrection: description.hasActiveCorrection,
          needsReview: description.needsReview,
          jobInFlight: jobs.some(
            (j) =>
              j.targetLocale === locale &&
              j.includeDescription &&
              j.descriptionSourceRevision === descriptionSourceRevision,
          ),
        },
      }),
      name,
      description,
    };
  });

  return {
    gameId,
    name: originalName,
    description: originalDescription,
    meta: {
      nameSourceRevision,
      descriptionSourceRevision,
      keepOriginalNameInAllLocales,
      nameSourceLocaleOverride: meta?.nameSourceLocaleOverride ?? null,
      descriptionSourceLocaleOverride: meta?.descriptionSourceLocaleOverride ?? null,
    },
    locales,
  };
}

function buildFieldDto(args: {
  field: 'name' | 'description';
  locale: string;
  original: string | null;
  sourceRevision: number;
  preserveAsOriginal: boolean;
  row: {
    automaticText: string | null;
    generationState: string;
    provenance: string | null;
    manualOverrideText: string | null;
    manualOverrideSourceRevision: number | null;
    recordRevision: number;
    sourceRevision: number;
  } | null;
  reviewText: string | null;
  jobInFlight: boolean;
}): GameTextEditorFieldDto {
  const row = args.row;
  const hasActiveCorrection =
    !!row &&
    row.manualOverrideText != null &&
    row.manualOverrideSourceRevision === args.sourceRevision;

  let effectiveText: string | null = args.original;
  if (args.preserveAsOriginal || args.original == null) {
    effectiveText = args.original;
  } else if (hasActiveCorrection && row) {
    effectiveText = row.manualOverrideText;
  } else if (row && row.sourceRevision === args.sourceRevision && row.generationState === 'ready') {
    effectiveText = row.automaticText ?? args.original;
  }

  return {
    field: args.field,
    original: args.original,
    sourceRevision: args.sourceRevision,
    effectiveText,
    automaticText:
      row && row.sourceRevision === args.sourceRevision ? row.automaticText : null,
    generationState:
      args.preserveAsOriginal || args.original == null
        ? 'not_needed'
        : row && row.sourceRevision === args.sourceRevision
          ? row.generationState
          : args.jobInFlight
            ? 'pending'
            : null,
    provenance: args.preserveAsOriginal
      ? 'preserved_name'
      : args.original == null
        ? 'empty_source'
        : hasActiveCorrection
          ? 'manual_override'
          : row && row.sourceRevision === args.sourceRevision
            ? row.provenance
            : null,
    hasActiveCorrection,
    needsReview: args.reviewText != null && !hasActiveCorrection,
    reviewCorrectionText: args.reviewText,
    recordRevision: row?.recordRevision ?? null,
    preserveAsOriginal: args.preserveAsOriginal,
  };
}

export async function patchGameTextTranslation(
  input: PatchGameTextTranslationInput,
): Promise<GameTextTranslationsEditorDto> {
  const locale = normalizeEditorLocale(input.locale);
  if (!input.name && !input.description) {
    throw new ApiError(400, 'At least one field patch is required');
  }

  let nameSourceRevision = 0;
  let descriptionSourceRevision = 0;

  await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: input.gameId },
      select: { id: true, name: true, description: true },
    });
    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const meta = await tx.gameTextSourceMeta.findUnique({
      where: { gameId: input.gameId },
    });
    nameSourceRevision = meta?.nameSourceRevision ?? 0;
    descriptionSourceRevision = meta?.descriptionSourceRevision ?? 0;

    if (input.name) {
      await applyFieldPatch(tx, {
        gameId: input.gameId,
        locale,
        field: 'name',
        patch: input.name,
        currentSourceRevision: nameSourceRevision,
        originalText: game.name,
        editorUserId: input.editorUserId,
        preserveAsOriginal: meta?.keepOriginalNameInAllLocales ?? false,
      });
    }
    if (input.description) {
      await applyFieldPatch(tx, {
        gameId: input.gameId,
        locale,
        field: 'description',
        patch: input.description,
        currentSourceRevision: descriptionSourceRevision,
        originalText: game.description,
        editorUserId: input.editorUserId,
        preserveAsOriginal: false,
      });
    }
  });

  void publishGameTextInvalidation({
    gameId: input.gameId,
    locale,
    nameSourceRevision,
    descriptionSourceRevision,
    reason: 'corrected',
  });

  return listGameTextTranslations(input.gameId);
}

async function applyFieldPatch(
  tx: Tx,
  args: {
    gameId: string;
    locale: AppUiLanguage;
    field: 'name' | 'description';
    patch: GameTextEditorFieldPatch;
    currentSourceRevision: number;
    originalText: string | null | undefined;
    editorUserId: string;
    preserveAsOriginal: boolean;
  },
): Promise<void> {
  if (args.preserveAsOriginal && args.field === 'name') {
    throw new ApiError(400, 'Name is preserved in every language; clear that policy to edit translations');
  }
  const original = normalizeAuthoredGameText(args.originalText);
  if (original == null) {
    throw new ApiError(400, `Cannot correct empty ${args.field}`);
  }
  if (args.patch.expectedSourceRevision !== args.currentSourceRevision) {
    throw new ApiError(409, 'Translation source revision conflict', true, {
      code: 'gameText.revisionConflict',
      field: args.field,
      expectedSourceRevision: args.patch.expectedSourceRevision,
      currentSourceRevision: args.currentSourceRevision,
    });
  }

  const existing = await tx.gameTextTranslation.findUnique({
    where: {
      gameId_field_locale: {
        gameId: args.gameId,
        field: args.field,
        locale: args.locale,
      },
    },
  });
  const currentRecordRevision = existing?.recordRevision ?? null;
  if (args.patch.expectedRecordRevision !== currentRecordRevision) {
    throw new ApiError(409, 'Translation record revision conflict', true, {
      code: 'gameText.revisionConflict',
      field: args.field,
      expectedRecordRevision: args.patch.expectedRecordRevision,
      currentRecordRevision,
    });
  }

  if (args.patch.action === 'clear') {
    if (!existing) {
      return;
    }
    if (existing.manualOverrideText != null && existing.manualOverrideEditedBy) {
      await tx.gameTextTranslationCorrection.create({
        data: {
          gameId: args.gameId,
          field: args.field,
          locale: args.locale,
          sourceRevision: existing.manualOverrideSourceRevision ?? existing.sourceRevision,
          correctedText: existing.manualOverrideText,
          sourceTextSnapshot: original,
          previousAutomaticText: existing.automaticText,
          editedBy: existing.manualOverrideEditedBy,
          supersededAt: new Date(),
        },
      });
    }
    await tx.gameTextTranslation.update({
      where: { id: existing.id },
      data: {
        manualOverrideText: null,
        manualOverrideSourceRevision: null,
        manualOverrideEditedBy: null,
        manualOverrideEditedAt: null,
        recordRevision: { increment: 1 },
      },
    });
    await supersedeOpenReviews(tx, {
      gameId: args.gameId,
      field: args.field,
      locale: args.locale,
    });
    return;
  }

  const text = normalizeAuthoredGameText(args.patch.text);
  if (text == null) {
    throw new ApiError(400, 'Correction text is required');
  }

  const now = new Date();
  if (!existing) {
    await tx.gameTextTranslation.create({
      data: {
        gameId: args.gameId,
        field: args.field,
        locale: args.locale,
        sourceRevision: args.currentSourceRevision,
        automaticText: null,
        generationState: 'pending',
        provenance: 'manual_override',
        manualOverrideText: text,
        manualOverrideSourceRevision: args.currentSourceRevision,
        manualOverrideEditedBy: args.editorUserId,
        manualOverrideEditedAt: now,
        recordRevision: 1,
      },
    });
  } else {
    if (
      existing.manualOverrideText != null &&
      existing.manualOverrideEditedBy &&
      existing.manualOverrideText !== text
    ) {
      await tx.gameTextTranslationCorrection.create({
        data: {
          gameId: args.gameId,
          field: args.field,
          locale: args.locale,
          sourceRevision: existing.manualOverrideSourceRevision ?? existing.sourceRevision,
          correctedText: existing.manualOverrideText,
          sourceTextSnapshot: original,
          previousAutomaticText: existing.automaticText,
          editedBy: existing.manualOverrideEditedBy,
          supersededAt: now,
        },
      });
    }
    await tx.gameTextTranslation.update({
      where: { id: existing.id },
      data: {
        sourceRevision: args.currentSourceRevision,
        provenance: 'manual_override',
        manualOverrideText: text,
        manualOverrideSourceRevision: args.currentSourceRevision,
        manualOverrideEditedBy: args.editorUserId,
        manualOverrideEditedAt: now,
        recordRevision: { increment: 1 },
      },
    });
  }

  await supersedeOpenReviews(tx, {
    gameId: args.gameId,
    field: args.field,
    locale: args.locale,
  });
}

async function supersedeOpenReviews(
  tx: Tx,
  args: { gameId: string; field: 'name' | 'description'; locale: string },
): Promise<void> {
  await tx.gameTextTranslationCorrection.updateMany({
    where: {
      gameId: args.gameId,
      field: args.field,
      locale: args.locale,
      supersededAt: null,
    },
    data: { supersededAt: new Date() },
  });
}

export async function retryGameTextTranslation(
  input: RetryGameTextTranslationInput,
): Promise<{ queued: boolean; jobId: string | null }> {
  const locale = normalizeEditorLocale(input.locale);

  const result = await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: input.gameId },
      select: { id: true, name: true, description: true },
    });
    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const meta = await tx.gameTextSourceMeta.upsert({
      where: { gameId: input.gameId },
      create: {
        gameId: input.gameId,
        nameSourceRevision: 0,
        descriptionSourceRevision: 0,
      },
      update: {},
    });

    const name = normalizeAuthoredGameText(game.name);
    const description = normalizeAuthoredGameText(game.description);
    const includeName = name != null && !meta.keepOriginalNameInAllLocales;
    const includeDescription = description != null;
    if (!includeName && !includeDescription) {
      throw new ApiError(400, 'Nothing to translate for this game');
    }

    const existingPending = await tx.gameTextTranslationJob.findFirst({
      where: {
        gameId: input.gameId,
        targetLocale: locale,
        nameSourceRevision: meta.nameSourceRevision,
        descriptionSourceRevision: meta.descriptionSourceRevision,
        policyVersion: GAME_TEXT_TRANSLATION_POLICY_VERSION,
        status: { in: ['pending', 'running'] },
      },
      select: { id: true },
    });
    if (existingPending) {
      return { queued: false, jobId: existingPending.id };
    }

    // Reset failed rows for this locale so list status becomes updating.
    await tx.gameTextTranslation.updateMany({
      where: {
        gameId: input.gameId,
        locale,
        generationState: 'failed',
      },
      data: {
        generationState: 'pending',
        recordRevision: { increment: 1 },
      },
    });

    const job = await tx.gameTextTranslationJob.create({
      data: {
        gameId: input.gameId,
        targetLocale: locale,
        nameSourceRevision: meta.nameSourceRevision,
        descriptionSourceRevision: meta.descriptionSourceRevision,
        policyVersion: GAME_TEXT_TRANSLATION_POLICY_VERSION,
        includeName,
        includeDescription,
        status: 'pending',
        runAfter: new Date(),
        attempts: 0,
      },
    });
    return { queued: true, jobId: job.id };
  });

  if (result.queued) {
    wakeGameTextTranslationWorker();
  }
  return result;
}

/**
 * Update keep-original-name / source-locale overrides on GameTextSourceMeta.
 * Called from authorized game update when those keys are present.
 */
export async function applyGameTextPolicyUpdateInTransaction(
  tx: Tx,
  input: GameTextPolicyUpdateInput,
): Promise<{ changed: boolean; shouldWakeWorker: boolean }> {
  const keepInPatch = Object.prototype.hasOwnProperty.call(
    input,
    'keepOriginalNameInAllLocales',
  );
  const nameLocaleInPatch = Object.prototype.hasOwnProperty.call(
    input,
    'nameSourceLocaleOverride',
  );
  const descriptionLocaleInPatch = Object.prototype.hasOwnProperty.call(
    input,
    'descriptionSourceLocaleOverride',
  );
  if (!keepInPatch && !nameLocaleInPatch && !descriptionLocaleInPatch) {
    return { changed: false, shouldWakeWorker: false };
  }

  const game = await tx.game.findUnique({
    where: { id: input.gameId },
    select: { name: true, description: true },
  });
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const existing = await tx.gameTextSourceMeta.findUnique({
    where: { gameId: input.gameId },
  });

  const nextKeep = keepInPatch
    ? Boolean(input.keepOriginalNameInAllLocales)
    : (existing?.keepOriginalNameInAllLocales ?? false);
  const nextNameLocale = nameLocaleInPatch
    ? (optionalLocaleOverride(input.nameSourceLocaleOverride) ?? null)
    : (existing?.nameSourceLocaleOverride ?? null);
  const nextDescriptionLocale = descriptionLocaleInPatch
    ? (optionalLocaleOverride(input.descriptionSourceLocaleOverride) ?? null)
    : (existing?.descriptionSourceLocaleOverride ?? null);

  const keepChanged =
    nextKeep !== (existing?.keepOriginalNameInAllLocales ?? false);
  const nameLocaleChanged =
    nextNameLocale !== (existing?.nameSourceLocaleOverride ?? null);
  const descriptionLocaleChanged =
    nextDescriptionLocale !== (existing?.descriptionSourceLocaleOverride ?? null);

  if (!keepChanged && !nameLocaleChanged && !descriptionLocaleChanged) {
    return { changed: false, shouldWakeWorker: false };
  }

  const nameSourceRevision = existing?.nameSourceRevision ?? 0;
  const descriptionSourceRevision = existing?.descriptionSourceRevision ?? 0;

  await tx.gameTextSourceMeta.upsert({
    where: { gameId: input.gameId },
    create: {
      gameId: input.gameId,
      nameSourceRevision,
      descriptionSourceRevision,
      keepOriginalNameInAllLocales: nextKeep,
      nameSourceLocaleOverride: nextNameLocale,
      descriptionSourceLocaleOverride: nextDescriptionLocale,
    },
    update: {
      keepOriginalNameInAllLocales: nextKeep,
      nameSourceLocaleOverride: nextNameLocale,
      descriptionSourceLocaleOverride: nextDescriptionLocale,
    },
  });

  if (keepChanged && nextKeep) {
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
    await tx.gameTextTranslationJob.updateMany({
      where: {
        gameId: input.gameId,
        status: 'pending',
        includeName: true,
        includeDescription: false,
      },
      data: { status: 'superseded' },
    });
    await tx.gameTextTranslationJob.updateMany({
      where: {
        gameId: input.gameId,
        status: 'pending',
        includeName: true,
        includeDescription: true,
      },
      data: { includeName: false },
    });
  }

  const name = normalizeAuthoredGameText(game.name);
  const description = normalizeAuthoredGameText(game.description);
  const enqueueJobs = input.enqueueJobs !== false;
  const shouldEnqueue =
    enqueueJobs &&
    ((keepChanged && !nextKeep && name != null) ||
      (nameLocaleChanged && name != null && !nextKeep) ||
      (descriptionLocaleChanged && description != null));

  let shouldWakeWorker = false;
  if (shouldEnqueue) {
    const includeName = name != null && !nextKeep;
    const includeDescription = description != null && descriptionLocaleChanged;
    const includeNameForJob =
      includeName && (keepChanged || nameLocaleChanged);
    if (includeNameForJob || includeDescription) {
      await tx.gameTextTranslationJob.updateMany({
        where: {
          gameId: input.gameId,
          status: 'pending',
          OR: [
            { nameSourceRevision: { not: nameSourceRevision } },
            { descriptionSourceRevision: { not: descriptionSourceRevision } },
          ],
        },
        data: { status: 'superseded' },
      });

      const runAfter = new Date(Date.now() + GAME_TEXT_TRANSLATION_JOB_DEBOUNCE_MS);
      for (const targetLocale of APP_UI_LANGUAGES) {
        const existingJob = await tx.gameTextTranslationJob.findFirst({
          where: {
            gameId: input.gameId,
            targetLocale,
            nameSourceRevision,
            descriptionSourceRevision,
            policyVersion: GAME_TEXT_TRANSLATION_POLICY_VERSION,
            status: { in: ['pending', 'running'] },
          },
        });
        if (existingJob) continue;
        await tx.gameTextTranslationJob.create({
          data: {
            gameId: input.gameId,
            targetLocale,
            nameSourceRevision,
            descriptionSourceRevision,
            policyVersion: GAME_TEXT_TRANSLATION_POLICY_VERSION,
            includeName: includeNameForJob,
            includeDescription,
            status: 'pending',
            runAfter,
          },
        });
      }
      shouldWakeWorker = true;
    }
  }

  return { changed: true, shouldWakeWorker };
}
