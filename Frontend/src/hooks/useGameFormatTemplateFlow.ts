import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import type { ScoringPreset, EntityType } from '@/types';
import {
  getTemplate,
  type CreateFlowIntent,
  type CreateTemplate,
  type CreateTemplateId,
  type SportPresetMeta,
} from '@/sport/createFlow';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import type { Sport } from '@shared/sport';
import { resolveWizardAllowedPresets } from '@/utils/gameFormat/scoringCompatibility';
import {
  applyTemplateToFormat,
  beginWizardSession,
  buildCreateBootstrap,
  computeDisplayState,
  evaluateParticipantRepick,
  evaluateSportChange,
  evaluateWizardClose,
  needsTemplateReapply,
  participantContextKey,
  syncSelectionFromFormat,
  type TemplateFormatSelection,
} from '@/utils/gameFormat/templateFormatCoordinator';
import { gameFormatSnapshotFromFormat } from '@/utils/gameFormat/gameFormatSnapshot';

export type GameFormatTemplateFlowInitial = {
  intent: CreateFlowIntent | null;
  templateId: CreateTemplateId | null;
};

export type UseGameFormatTemplateFlowParams = {
  enabled: boolean;
  sport: Sport;
  maxParticipants: number;
  gameFormat: UseGameFormatResult;
  allowedScoringPresets: ScoringPreset[];
  presetMeta: SportPresetMeta[];
  participantContext: CreateTemplateParticipantContext;
  initial?: GameFormatTemplateFlowInitial;
  skipInitialAutoSelect?: boolean;
  onIntentSideEffects?: (intent: CreateFlowIntent, template: CreateTemplate | null) => void;
  onAfterTemplateApply?: (template: CreateTemplate) => void | Promise<void>;
  formatWizardOpen?: boolean;
  entityType?: EntityType;
};

export function useGameFormatTemplateFlow({
  enabled,
  sport,
  maxParticipants,
  gameFormat,
  allowedScoringPresets,
  presetMeta,
  participantContext,
  initial,
  skipInitialAutoSelect = false,
  onIntentSideEffects,
  onAfterTemplateApply,
  formatWizardOpen = false,
  entityType,
}: UseGameFormatTemplateFlowParams) {
  const { t } = useTranslation();
  const [createIntent, setCreateIntent] = useState<CreateFlowIntent | null>(() => initial?.intent ?? null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<CreateTemplateId | null>(
    () => initial?.templateId ?? null,
  );

  const gameFormatRef = useRef(gameFormat);
  gameFormatRef.current = gameFormat;
  const skipAutoSelectRef = useRef(skipInitialAutoSelect);
  const initialParticipantContextKeyRef = useRef<string | null>(
    skipInitialAutoSelect ? participantContextKey(participantContext) : null,
  );
  const bootstrapRef = useRef(false);
  const lastAppliedTemplateKeyRef = useRef<string | null>(null);
  const explicitTemplatePickRef = useRef(false);
  const userChoseManualRef = useRef(false);
  const [wizardUsesFullPresets, setWizardUsesFullPresets] = useState(false);
  const prevSportRef = useRef<Sport | null>(null);

  const coordinatorCtx = useMemo(
    () => ({
      sport,
      maxParticipants,
      allowedScoringPresets,
      participantContext,
      entityType,
    }),
    [sport, maxParticipants, allowedScoringPresets, participantContext, entityType],
  );

  const selection = useMemo(
    (): TemplateFormatSelection => ({
      intent: createIntent ?? 'advanced',
      templateId: selectedTemplateId,
    }),
    [createIntent, selectedTemplateId],
  );

  const applySelection = useCallback(
    (next: TemplateFormatSelection, appliedKey?: string | null) => {
      setCreateIntent(next.intent);
      setSelectedTemplateId(next.templateId);
      if (appliedKey !== undefined) {
        lastAppliedTemplateKeyRef.current = appliedKey;
      }
      onIntentSideEffects?.(next.intent, next.templateId ? getTemplate(next.templateId) : null);
    },
    [onIntentSideEffects],
  );

  const demoteToManualFormat = useCallback(() => {
    userChoseManualRef.current = true;
    lastAppliedTemplateKeyRef.current = null;
    applySelection({ intent: 'advanced', templateId: null }, null);
  }, [applySelection]);

  const applyTemplateToFormatSync = useCallback(
    (template: CreateTemplate, overrides?: Parameters<typeof applyTemplateToFormat>[3]) => {
      flushSync(() => {
        applyTemplateToFormat(template, gameFormatRef.current, maxParticipants, overrides);
      });
    },
    [maxParticipants],
  );

  const applyTemplateSelection = useCallback(
    async (template: CreateTemplate, options?: { persist?: boolean; sync?: boolean }) => {
      explicitTemplatePickRef.current = true;
      userChoseManualRef.current = false;
      const next = { intent: template.tier, templateId: template.id } as const;
      applySelection(next, `${template.id}:${maxParticipants}`);
      if (options?.sync === false) {
        applyTemplateToFormat(template, gameFormatRef.current, maxParticipants);
      } else {
        applyTemplateToFormatSync(template);
      }
      if (options?.persist) {
        await onAfterTemplateApply?.(template);
      }
    },
    [applySelection, applyTemplateToFormatSync, maxParticipants, onAfterTemplateApply],
  );

  const syncSelectionFromFormatState = useCallback(() => {
    if (!enabled) return;
    const result = syncSelectionFromFormat(coordinatorCtx, gameFormatRef.current, selection, {
      userChoseManual: userChoseManualRef.current,
    });
    if (result.type === 'demote') {
      demoteToManualFormat();
      return;
    }
    if (result.type === 'promote') {
      userChoseManualRef.current = false;
      applySelection(result.selection, result.appliedKey);
      onIntentSideEffects?.(result.selection.intent, getTemplate(result.selection.templateId!));
    }
  }, [enabled, coordinatorCtx, selection, demoteToManualFormat, applySelection, onIntentSideEffects]);

  const handleTemplateSelect = useCallback(
    (template: CreateTemplate) => {
      void applyTemplateSelection(template, { persist: Boolean(onAfterTemplateApply) });
    },
    [applyTemplateSelection, onAfterTemplateApply],
  );

  const handleAmericanoPointsChange = useCallback(
    (preset: ScoringPreset) => {
      const id = selectedTemplateId;
      if (!id) return;
      const tpl = getTemplate(id);
      if (tpl.inlineConfig?.type !== 'points_total') return;
      applyTemplateToFormatSync(tpl, { scoringPreset: preset });
      void onAfterTemplateApply?.(tpl);
    },
    [selectedTemplateId, applyTemplateToFormatSync, onAfterTemplateApply],
  );

  const handleTimedMinutesChange = useCallback(
    (minutes: number) => {
      const id = selectedTemplateId;
      if (!id) return;
      const tpl = getTemplate(id);
      if (tpl.inlineConfig?.type !== 'timed_duration') return;
      applyTemplateToFormatSync(tpl, { matchTimedCapMinutes: minutes });
      void onAfterTemplateApply?.(tpl);
    },
    [selectedTemplateId, applyTemplateToFormatSync, onAfterTemplateApply],
  );

  const handleCustomSelect = useCallback(() => {
    explicitTemplatePickRef.current = true;
    userChoseManualRef.current = true;
    lastAppliedTemplateKeyRef.current = null;
    applySelection({ intent: 'advanced', templateId: null }, null);
  }, [applySelection]);

  const notifyFormatWizardOpen = useCallback(() => {
    const session = beginWizardSession(selection);
    setWizardUsesFullPresets(session.usesFullPresets);
  }, [selection]);

  const handleWizardClose = useCallback(() => {
    setWizardUsesFullPresets(false);
    const result = evaluateWizardClose(
      coordinatorCtx,
      gameFormatRef.current,
      selection,
      { userChoseManual: userChoseManualRef.current },
    );

    if (result.type === 'demote') {
      demoteToManualFormat();
      return;
    }
    if (result.type === 'resync') {
      if (result.sync.type === 'demote') {
        demoteToManualFormat();
        return;
      }
      if (result.sync.type === 'promote') {
        userChoseManualRef.current = false;
        applySelection(result.sync.selection, result.sync.appliedKey);
      }
      return;
    }
    syncSelectionFromFormatState();
  }, [coordinatorCtx, selection, demoteToManualFormat, applySelection, syncSelectionFromFormatState]);

  const wizardAllowedPresets = useMemo(
    () =>
      wizardUsesFullPresets
        ? allowedScoringPresets
        : resolveWizardAllowedPresets(
            sport,
            allowedScoringPresets,
            presetMeta,
            enabled ? createIntent : null,
            gameFormat.scoringMode,
            gameFormat.generationType,
          ),
    [
      wizardUsesFullPresets,
      sport,
      allowedScoringPresets,
      presetMeta,
      enabled,
      createIntent,
      gameFormat.scoringMode,
      gameFormat.generationType,
    ],
  );

  const { isCustom, activeTemplateId } = computeDisplayState(
    enabled,
    selection,
    gameFormat,
    maxParticipants,
  );
  const showManualCard = isCustom;
  const showFormatSection = !enabled || createIntent != null;
  const formatWizardCustomizeLabel =
    enabled && (activeTemplateId != null || isCustom)
      ? t('createGame.intent.customizeFormat')
      : undefined;

  useEffect(() => {
    if (!enabled) return;
    if (prevSportRef.current === sport) return;
    prevSportRef.current = sport;
    if (skipAutoSelectRef.current) {
      skipAutoSelectRef.current = false;
      return;
    }
    userChoseManualRef.current = false;
    explicitTemplatePickRef.current = false;
    const sportResult = evaluateSportChange(coordinatorCtx, {
      skipInitialAutoSelect: false,
    });
    if (sportResult.type === 'repick') {
      void applyTemplateSelection(getTemplate(sportResult.selection.templateId!), { sync: false });
    } else {
      demoteToManualFormat();
    }
  }, [enabled, sport, coordinatorCtx, applyTemplateSelection, demoteToManualFormat]);

  useEffect(() => {
    const repick = evaluateParticipantRepick(coordinatorCtx, selection, {
      userChoseManual: userChoseManualRef.current,
      explicitTemplatePick: explicitTemplatePickRef.current,
      bootstrapped: bootstrapRef.current,
      skipInitialAutoSelect: skipAutoSelectRef.current,
      formatWizardOpen,
      initialParticipantContextKey: initialParticipantContextKeyRef.current,
    });
    if (explicitTemplatePickRef.current) {
      explicitTemplatePickRef.current = false;
    }
    if (skipAutoSelectRef.current) {
      skipAutoSelectRef.current = false;
    }
    if (!enabled || repick.type === 'skip') return;

    if (repick.type === 'repick') {
      void applyTemplateSelection(getTemplate(repick.selection.templateId!), { sync: false });
    } else {
      demoteToManualFormat();
    }
  }, [
    enabled,
    formatWizardOpen,
    coordinatorCtx,
    selection,
    applyTemplateSelection,
    demoteToManualFormat,
  ]);

  useEffect(() => {
    const reapply = needsTemplateReapply(
      enabled,
      formatWizardOpen,
      selection,
      maxParticipants,
      lastAppliedTemplateKeyRef.current,
    );
    if (!reapply) return;
    lastAppliedTemplateKeyRef.current = reapply.key;
    applyTemplateToFormat(reapply.template, gameFormatRef.current, maxParticipants);
  }, [
    enabled,
    formatWizardOpen,
    maxParticipants,
    selection,
    gameFormat.scoringMode,
    gameFormat.scoringPreset,
    gameFormat.generationType,
  ]);

  const prevSportForSyncRef = useRef(sport);
  useEffect(() => {
    if (!enabled || formatWizardOpen) return;
    const sportChanged = prevSportForSyncRef.current !== sport;
    prevSportForSyncRef.current = sport;
    if (sportChanged) return;
    syncSelectionFromFormatState();
  }, [
    enabled,
    formatWizardOpen,
    sport,
    syncSelectionFromFormatState,
    gameFormat.scoringMode,
    gameFormat.scoringPreset,
    gameFormat.generationType,
    gameFormat.matchTimerEnabled,
    gameFormat.matchTimedCapMinutes,
    gameFormat.customPointsTotal,
    gameFormat.winnerOfGame,
  ]);

  const runInitialBootstrap = useCallback(
    (intent: CreateFlowIntent, templateId: CreateTemplateId | null) => {
      if (bootstrapRef.current) return;
      const bootstrap = buildCreateBootstrap(intent, templateId, maxParticipants);
      bootstrapRef.current = bootstrap.flags.bootstrapped ?? true;
      if (bootstrap.flags.userChoseManual) userChoseManualRef.current = true;
      if (bootstrap.flags.explicitTemplatePick) explicitTemplatePickRef.current = true;
      applySelection(bootstrap.selection, bootstrap.appliedKey);
      if (templateId) {
        applyTemplateToFormat(getTemplate(templateId), gameFormatRef.current, maxParticipants);
      }
    },
    [applySelection, maxParticipants],
  );

  return {
    createIntent,
    selectedTemplateId,
    activeTemplateId,
    isCustom,
    showManualCard,
    showFormatSection,
    formatWizardCustomizeLabel,
    wizardAllowedPresets,
    handleTemplateSelect,
    handleCustomSelect,
    handleAmericanoPointsChange,
    handleTimedMinutesChange,
    handleWizardClose,
    notifyFormatWizardOpen,
    applyTemplateToFormat: useCallback(
      (template: CreateTemplate, overrides?: Parameters<typeof applyTemplateToFormat>[3]) => {
        applyTemplateToFormat(template, gameFormatRef.current, maxParticipants, overrides);
      },
      [maxParticipants],
    ),
    runInitialBootstrap,
    gameFormatRef,
    gameFormatSnapshot: () => gameFormatSnapshotFromFormat(gameFormatRef.current),
  };
}
