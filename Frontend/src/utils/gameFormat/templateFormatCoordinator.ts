import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import type { ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import type { Game } from '@/types';
import {
  getTemplate,
  pickDefaultTemplateId,
  type CreateFlowIntent,
  type CreateTemplate,
  type CreateTemplateId,
} from '@/sport/createFlow';
import {
  listTemplatesForParticipantSetup,
  type CreateTemplateParticipantContext,
} from '@/sport/createTemplateParticipantFit';
import { applyCreateTemplate, type ApplyCreateTemplateOverrides } from '@/utils/gameFormat/applyCreateTemplate';
import { resolveCreateTemplateGeneration } from '@/utils/gameFormat/createTemplateGeneration';
import {
  gameFormatSnapshotFromFormat,
  gameFormatSnapshotFromGame,
  type GameFormatTemplateSnapshot,
} from '@/utils/gameFormat/gameFormatSnapshot';

export type FormatSnapshot = GameFormatTemplateSnapshot;

export type TemplateFormatSelection = {
  intent: CreateFlowIntent;
  templateId: CreateTemplateId | null;
};

export type TemplateFormatCoordinatorContext = {
  sport: Sport;
  maxParticipants: number;
  allowedScoringPresets: ScoringPreset[];
  participantContext: CreateTemplateParticipantContext;
};

export type TemplateFormatCoordinatorFlags = {
  userChoseManual: boolean;
  explicitTemplatePick: boolean;
  bootstrapped: boolean;
  skipInitialAutoSelect: boolean;
  formatWizardOpen: boolean;
  initialParticipantContextKey: string | null;
};

export function participantContextKey(ctx: CreateTemplateParticipantContext): string {
  return `${ctx.maxParticipants}:${ctx.playersPerMatch}:${ctx.hasFixedTeams}:${ctx.genderTeams}`;
}

/** Registry metadata is the single authority for format ↔ template match. */
export function formatMatchesCreateTemplate(
  template: CreateTemplate,
  format: FormatSnapshot,
  maxParticipants: number,
): boolean {
  if (format.scoringPreset === 'CUSTOM' || format.customPointsTotal != null) return false;

  const expectedGen = resolveCreateTemplateGeneration(template, maxParticipants);
  if (format.generationType !== expectedGen) return false;

  const scoresDeltaWinner = format.winnerOfGame === 'BY_SCORES_DELTA';
  const matchWinner = format.winnerOfGame === 'BY_MATCHES_WON';
  const expectsScoresDeltaWinner =
    template.inlineConfig?.type === 'points_total' ||
    template.gameType === 'AMERICANO' ||
    template.gameType === 'MEXICANO';
  const winnerOk = expectsScoresDeltaWinner ? scoresDeltaWinner : matchWinner;

  if (template.inlineConfig?.type === 'points_total') {
    return (
      format.scoringMode === 'POINTS' &&
      format.scoringPreset.startsWith('POINTS_') &&
      !format.matchTimerEnabled &&
      winnerOk
    );
  }

  if (template.inlineConfig?.type === 'timed_duration') {
    return (
      format.scoringPreset === template.scoringPreset &&
      format.matchTimerEnabled &&
      template.inlineConfig.options.includes(format.matchTimedCapMinutes) &&
      winnerOk
    );
  }

  if (template.matchTimerEnabled) {
    const cap = template.matchTimedCapMinutes ?? 15;
    return (
      format.scoringPreset === template.scoringPreset &&
      format.matchTimerEnabled &&
      format.matchTimedCapMinutes === cap &&
      winnerOk
    );
  }

  return (
    format.scoringPreset === template.scoringPreset &&
    !format.matchTimerEnabled &&
    winnerOk
  );
}

export function formatMatchesCreateTemplateFromFormat(
  template: CreateTemplate,
  format: UseGameFormatResult,
  maxParticipants: number,
): boolean {
  return formatMatchesCreateTemplate(template, gameFormatSnapshotFromFormat(format), maxParticipants);
}

function toFormatSnapshot(format: UseGameFormatResult | FormatSnapshot): FormatSnapshot {
  return 'setScoringMode' in format ? gameFormatSnapshotFromFormat(format) : format;
}

export function findMatchingTemplateId(
  ctx: TemplateFormatCoordinatorContext,
  format: UseGameFormatResult | FormatSnapshot,
): CreateTemplateId | null {
  const snapshot = toFormatSnapshot(format);
  const templates = listTemplatesForParticipantSetup(
    ctx.sport,
    ctx.allowedScoringPresets,
    ctx.participantContext,
  );
  for (const tpl of templates) {
    if (formatMatchesCreateTemplate(tpl, snapshot, ctx.maxParticipants)) {
      return tpl.id;
    }
  }
  return null;
}

export function inferTemplateFromFormat(
  ctx: TemplateFormatCoordinatorContext,
  format: UseGameFormatResult | FormatSnapshot | Partial<Game>,
  formatSnapshot?: FormatSnapshot,
): TemplateFormatSelection {
  const snapshot =
    formatSnapshot ??
    ('setScoringMode' in format
      ? gameFormatSnapshotFromFormat(format)
      : 'maxParticipants' in format || 'matchGenerationType' in format
        ? gameFormatSnapshotFromGame(format as Partial<Game>)
        : toFormatSnapshot(format as UseGameFormatResult | FormatSnapshot));
  const matchingId = findMatchingTemplateId(ctx, snapshot);
  if (matchingId != null) {
    const tpl = getTemplate(matchingId);
    return { intent: tpl.tier, templateId: matchingId };
  }
  return { intent: 'advanced', templateId: null };
}

export function snapshotsEqual(a: FormatSnapshot, b: FormatSnapshot): boolean {
  return (
    a.scoringMode === b.scoringMode &&
    a.scoringPreset === b.scoringPreset &&
    a.generationType === b.generationType &&
    a.matchTimerEnabled === b.matchTimerEnabled &&
    a.matchTimedCapMinutes === b.matchTimedCapMinutes &&
    a.customPointsTotal === b.customPointsTotal &&
    a.winnerOfGame === b.winnerOfGame &&
    a.deucesBeforeGoldenPoint === b.deucesBeforeGoldenPoint
  );
}

export function manualSelection(): TemplateFormatSelection {
  return { intent: 'advanced', templateId: null };
}

export function selectionFromTemplate(template: CreateTemplate): TemplateFormatSelection {
  return { intent: template.tier, templateId: template.id };
}

export function appliedTemplateKey(templateId: CreateTemplateId, maxParticipants: number): string {
  return `${templateId}:${maxParticipants}`;
}

export function applyTemplateToFormat(
  template: CreateTemplate,
  format: UseGameFormatResult,
  maxParticipants: number,
  overrides?: ApplyCreateTemplateOverrides,
): void {
  applyCreateTemplate(template, format, maxParticipants, overrides);
}

export type SyncFromFormatResult =
  | { type: 'unchanged' }
  | { type: 'demote' }
  | { type: 'promote'; selection: TemplateFormatSelection; appliedKey: string };

export function syncSelectionFromFormat(
  ctx: TemplateFormatCoordinatorContext,
  format: UseGameFormatResult,
  selection: TemplateFormatSelection,
  flags: Pick<TemplateFormatCoordinatorFlags, 'userChoseManual'>,
): SyncFromFormatResult {
  const lockedManual =
    flags.userChoseManual && selection.intent === 'advanced' && selection.templateId == null;

  if (selection.templateId != null && selection.intent !== 'advanced') {
    const selectedTpl = getTemplate(selection.templateId);
    if (!formatMatchesCreateTemplateFromFormat(selectedTpl, format, ctx.maxParticipants)) {
      return { type: 'demote' };
    }
  }

  const matchingId = findMatchingTemplateId(ctx, format);
  if (matchingId != null) {
    const tpl = getTemplate(matchingId);
    if (selection.intent !== tpl.tier || selection.templateId !== matchingId) {
      return {
        type: 'promote',
        selection: selectionFromTemplate(tpl),
        appliedKey: appliedTemplateKey(matchingId, ctx.maxParticipants),
      };
    }
    return { type: 'unchanged' };
  }

  if (!lockedManual) {
    return { type: 'demote' };
  }
  return { type: 'unchanged' };
}

export function beginWizardSession(
  selection: TemplateFormatSelection,
): { usesFullPresets: boolean } {
  const fromTemplate = selection.templateId != null && selection.intent !== 'advanced';
  return { usesFullPresets: fromTemplate };
}

export type WizardCloseResult =
  | { type: 'unchanged' }
  | { type: 'demote' }
  | { type: 'resync'; sync: SyncFromFormatResult };

export function evaluateWizardClose(
  ctx: TemplateFormatCoordinatorContext,
  format: UseGameFormatResult,
  selection: TemplateFormatSelection,
  flags: Pick<TemplateFormatCoordinatorFlags, 'userChoseManual'>,
): WizardCloseResult {
  if (selection.templateId != null && selection.intent !== 'advanced') {
    const tpl = getTemplate(selection.templateId);
    const mismatchesSelectedTemplate = !formatMatchesCreateTemplateFromFormat(
      tpl,
      format,
      ctx.maxParticipants,
    );

    if (mismatchesSelectedTemplate) {
      return { type: 'demote' };
    }
  }
  const sync = syncSelectionFromFormat(ctx, format, selection, flags);
  if (sync.type === 'unchanged') return { type: 'unchanged' };
  return { type: 'resync', sync };
}

export type ParticipantRepickResult =
  | { type: 'skip' }
  | { type: 'repick'; selection: TemplateFormatSelection; appliedKey: string }
  | { type: 'demote' };

export function evaluateParticipantRepick(
  ctx: TemplateFormatCoordinatorContext,
  selection: TemplateFormatSelection,
  flags: TemplateFormatCoordinatorFlags,
): ParticipantRepickResult {
  if (flags.formatWizardOpen) return { type: 'skip' };
  if (flags.skipInitialAutoSelect) {
    return { type: 'skip' };
  }
  if (
    flags.initialParticipantContextKey != null &&
    participantContextKey(ctx.participantContext) === flags.initialParticipantContextKey
  ) {
    return { type: 'skip' };
  }
  if (flags.explicitTemplatePick) {
    return { type: 'skip' };
  }
  if (
    flags.userChoseManual &&
    selection.intent === 'advanced' &&
    selection.templateId == null
  ) {
    return { type: 'skip' };
  }

  const currentTemplateId = selection.templateId;
  const stillValid =
    currentTemplateId != null &&
    pickDefaultTemplateId(
      ctx.sport,
      ctx.allowedScoringPresets,
      ctx.participantContext,
      currentTemplateId,
    ) === currentTemplateId;
  if (stillValid) return { type: 'skip' };

  const nextId = pickDefaultTemplateId(
    ctx.sport,
    ctx.allowedScoringPresets,
    ctx.participantContext,
    currentTemplateId,
  );
  if (nextId) {
    const tpl = getTemplate(nextId);
    return {
      type: 'repick',
      selection: selectionFromTemplate(tpl),
      appliedKey: appliedTemplateKey(nextId, ctx.maxParticipants),
    };
  }
  return { type: 'demote' };
}

export type SportChangeResult =
  | { type: 'repick'; selection: TemplateFormatSelection; appliedKey: string }
  | { type: 'demote' };

export function evaluateSportChange(
  ctx: TemplateFormatCoordinatorContext,
  flags: Pick<TemplateFormatCoordinatorFlags, 'skipInitialAutoSelect'>,
): SportChangeResult {
  if (flags.skipInitialAutoSelect) {
    return { type: 'demote' };
  }
  const nextId = pickDefaultTemplateId(
    ctx.sport,
    ctx.allowedScoringPresets,
    ctx.participantContext,
    null,
  );
  if (nextId) {
    const tpl = getTemplate(nextId);
    return {
      type: 'repick',
      selection: selectionFromTemplate(tpl),
      appliedKey: appliedTemplateKey(nextId, ctx.maxParticipants),
    };
  }
  return { type: 'demote' };
}

export function buildCreateBootstrap(
  intent: CreateFlowIntent | null,
  templateId: CreateTemplateId | null,
  maxParticipants: number,
): {
  selection: TemplateFormatSelection;
  flags: Partial<TemplateFormatCoordinatorFlags>;
  appliedKey: string | null;
} {
  const resolvedIntent = intent ?? 'advanced';
  const selection: TemplateFormatSelection =
    resolvedIntent === 'advanced' && templateId == null
      ? manualSelection()
      : { intent: resolvedIntent, templateId };
  return {
    selection,
    flags: {
      userChoseManual: resolvedIntent === 'advanced' && templateId == null,
      bootstrapped: true,
      explicitTemplatePick: true,
    },
    appliedKey: templateId ? appliedTemplateKey(templateId, maxParticipants) : null,
  };
}

export function computeDisplayState(
  enabled: boolean,
  selection: TemplateFormatSelection,
  format: UseGameFormatResult,
  maxParticipants: number,
): {
  selectedTemplateMatches: boolean;
  isCustom: boolean;
  activeTemplateId: CreateTemplateId | null;
} {
  const selectedTemplateMatches =
    enabled &&
    selection.templateId != null &&
    selection.intent !== 'advanced' &&
    formatMatchesCreateTemplateFromFormat(getTemplate(selection.templateId), format, maxParticipants);
  const isCustom =
    selection.intent === 'advanced' ||
    (enabled && selection.templateId != null && !selectedTemplateMatches);
  const activeTemplateId = selectedTemplateMatches ? selection.templateId : null;
  return { selectedTemplateMatches, isCustom, activeTemplateId };
}

export function needsTemplateReapply(
  enabled: boolean,
  formatWizardOpen: boolean,
  selection: TemplateFormatSelection,
  maxParticipants: number,
  lastAppliedKey: string | null,
): { template: CreateTemplate; key: string } | null {
  if (!enabled || formatWizardOpen) return null;
  if (selection.intent === 'advanced' || selection.templateId == null) return null;
  const key = appliedTemplateKey(selection.templateId, maxParticipants);
  if (lastAppliedKey === key) return null;
  return { template: getTemplate(selection.templateId), key };
}
