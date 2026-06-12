import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, LayoutGrid, Settings2 } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { CreateTemplate, CreateTemplateId } from '@/sport/createFlow';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import { listTemplatesForParticipantSetup } from '@/sport/createTemplateParticipantFit';
import type { GameType, GenderTeam, MatchGenerationType, ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { SelectionTile } from '@/components/multisport/SelectionTile';
import { getCreateTemplateIcon } from '@/utils/createTemplateVisuals';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { ToggleSwitch } from '../ToggleSwitch';
import {
  CreateTemplatePointsPicker,
  CreateTemplateTimedPicker,
} from './CreateTemplateInlinePickers';
import { CreateTemplateInlineReveal } from './CreateTemplateInlineReveal';
import { CreateTemplateCardTrailing, CreateTemplateCustomTrailing } from './CreateTemplateCardTrailing';
import type { CreateTemplateDurationContext } from './createTemplateDurationLabels';
import { estimateDurationLabelForCustomFormat } from './createTemplateDurationLabels';
import { CreateTemplateCustomizeButton } from './CreateTemplateCustomizeButton';
import { CreateGameIntentCollapsedBadges } from './CreateGameIntentCollapsedBadges';

export type FormatCustomizeAnchor = CreateTemplateId | 'custom';

type CardEntry =
  | { kind: 'template'; tpl: CreateTemplate }
  | { kind: 'custom' };

type Props = {
  sport: Sport;
  allowedScoringPresets: ScoringPreset[];
  participantContext: CreateTemplateParticipantContext;
  selectedTemplateId: CreateTemplateId | null;
  isCustom: boolean;
  showManualCard?: boolean;
  onSelectTemplate: (template: CreateTemplate) => void;
  onSelectCustom: () => void;
  isRatingGame: boolean;
  onRatingGameChange: (checked: boolean) => void;
  scoringPreset: ScoringPreset;
  matchTimedCapMinutes: number;
  onAmericanoPointsChange: (preset: ScoringPreset) => void;
  onTimedMinutesChange: (minutes: number) => void;
  durationContext: CreateTemplateDurationContext;
  customMatchGenerationType: MatchGenerationType;
  customGameType: GameType;
  customMatchTimerEnabled: boolean;
  customCustomPointsTotal?: number | null;
  readOnly?: boolean;
  showRatingToggle?: boolean;
  formatSection?: ReactNode;
  genderSection?: ReactNode;
  onOpenFormatWizard?: () => void;
  formatWizardCustomizeLabel?: string;
  collapsible?: boolean;
  genderTeams?: GenderTeam;
};

function TierPill({
  tier,
  labelKey,
  variant,
}: {
  tier: 'social' | 'match';
  labelKey?: string;
  variant?: 'social' | 'match' | 'official';
}) {
  const { t } = useTranslation();
  const label = labelKey ? t(labelKey) : t(`createGame.intent.${tier}.title`);
  const tone = variant ?? tier;
  const className =
    tone === 'social'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : tone === 'official'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
        : 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200';
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

function cardEntryKey(entry: CardEntry): string {
  return entry.kind === 'template' ? entry.tpl.id : 'custom';
}

function buildOrderedCards(
  templates: CreateTemplate[],
  showManualCard: boolean,
  collapsible: boolean,
  selectedTemplateId: CreateTemplateId | null,
  isCustom: boolean,
): CardEntry[] {
  const entries: CardEntry[] = [
    ...templates.map((tpl) => ({ kind: 'template' as const, tpl })),
    ...(showManualCard ? [{ kind: 'custom' as const }] : []),
  ];
  if (!collapsible) return entries;

  if (isCustom && showManualCard) {
    const custom = entries.filter((e) => e.kind === 'custom');
    const rest = entries.filter((e) => e.kind !== 'custom');
    return [...custom, ...rest];
  }
  if (selectedTemplateId) {
    const selected = entries.filter(
      (e) => e.kind === 'template' && e.tpl.id === selectedTemplateId,
    );
    const rest = entries.filter(
      (e) => !(e.kind === 'template' && e.tpl.id === selectedTemplateId),
    );
    return [...selected, ...rest];
  }
  return entries;
}

export const CreateGameIntentPicker = ({
  sport,
  allowedScoringPresets,
  participantContext,
  selectedTemplateId,
  isCustom,
  showManualCard = true,
  onSelectTemplate,
  onSelectCustom,
  isRatingGame,
  onRatingGameChange,
  scoringPreset,
  matchTimedCapMinutes,
  onAmericanoPointsChange,
  onTimedMinutesChange,
  durationContext,
  customMatchGenerationType,
  customGameType,
  customMatchTimerEnabled,
  customCustomPointsTotal,
  readOnly = false,
  showRatingToggle = true,
  formatSection,
  genderSection,
  onOpenFormatWizard,
  formatWizardCustomizeLabel,
  collapsible = false,
  genderTeams,
}: Props) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const templates = listTemplatesForParticipantSetup(sport, allowedScoringPresets, participantContext);
  const hasSelection = selectedTemplateId != null || isCustom;
  const customizeAnchor: FormatCustomizeAnchor | null = isCustom
    ? 'custom'
    : selectedTemplateId;
  const showFormatCustomize =
    customizeAnchor != null && !!formatWizardCustomizeLabel && !!onOpenFormatWizard;

  const orderedCards = useMemo(
    () => buildOrderedCards(templates, showManualCard, collapsible, selectedTemplateId, isCustom),
    [templates, showManualCard, collapsible, selectedTemplateId, isCustom],
  );

  const canCollapse = collapsible && hasSelection && orderedCards.length > 1;
  const effectiveCollapsed = canCollapse && isCollapsed;

  const expandTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.21, 0.47, 0.32, 0.98] as const };

  const layoutTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: 'easeInOut' as const };

  const scrollSectionToTop = () => {
    requestAnimationFrame(() => {
      const el = sectionRef.current;
      if (!el) return;
      const floatingBar = document.querySelector<HTMLElement>('[data-floating-summary-bar]');
      el.style.scrollMarginTop = floatingBar ? `${floatingBar.offsetHeight + 8}px` : '';
      el.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  const handleSelectTemplate = (tpl: CreateTemplate) => {
    const movesToTop =
      collapsible &&
      !(orderedCards[0]?.kind === 'template' && orderedCards[0].tpl.id === tpl.id);
    onSelectTemplate(tpl);
    if (movesToTop) scrollSectionToTop();
  };

  const handleSelectCustom = () => {
    const movesToTop = collapsible && orderedCards[0]?.kind !== 'custom';
    onSelectCustom();
    if (movesToTop) scrollSectionToTop();
  };

  const handleCollapseToggle = () => {
    if (!effectiveCollapsed) {
      setIsCollapsed(true);
      scrollSectionToTop();
      return;
    }
    setIsCollapsed(false);
  };

  const renderTemplateCard = (tpl: CreateTemplate, collapsedSummary: boolean) => {
    const Icon = getCreateTemplateIcon(tpl.id);
    const selected = !isCustom && selectedTemplateId === tpl.id;
    const showPointsPicker = !collapsedSummary && selected && tpl.inlineConfig?.type === 'points_total';
    const timedOptions =
      tpl.inlineConfig?.type === 'timed_duration' ? tpl.inlineConfig.options : ([10, 15, 20] as const);
    const showTimedPicker = !collapsedSummary && selected && tpl.inlineConfig?.type === 'timed_duration';
    const hasInlinePanel = showPointsPicker || showTimedPicker;

    return (
      <>
        <SelectionTile
          selected={selected}
          onClick={
            readOnly
              ? () => {}
              : () => {
                  if (collapsedSummary) {
                    setIsCollapsed(false);
                    return;
                  }
                  handleSelectTemplate(tpl);
                }
          }
          icon={Icon}
          title={t(tpl.labelKey)}
          description={tpl.descriptionKey ? t(tpl.descriptionKey) : undefined}
          badges={<TierPill tier={tpl.tier} labelKey={tpl.badgeLabelKey} variant={tpl.badgeVariant} />}
          className={
            hasInlinePanel
              ? 'rounded-b-none border-b-0 transition-[border-radius] duration-200'
              : undefined
          }
          topTrailing={<CreateTemplateCardTrailing tpl={tpl} durationContext={durationContext} />}
        />
        <CreateTemplateInlineReveal open={!!showPointsPicker}>
          <CreateTemplatePointsPicker
            scoringPreset={scoringPreset}
            allowedPresets={allowedScoringPresets}
            sport={sport}
            onPresetChange={onAmericanoPointsChange}
          />
        </CreateTemplateInlineReveal>
        <CreateTemplateInlineReveal open={!!showTimedPicker}>
          <CreateTemplateTimedPicker
            minutes={matchTimedCapMinutes}
            options={timedOptions}
            onChange={onTimedMinutesChange}
          />
        </CreateTemplateInlineReveal>
        {!collapsedSummary && showFormatCustomize && customizeAnchor === tpl.id ? (
          <CreateTemplateCustomizeButton
            label={formatWizardCustomizeLabel!}
            onClick={onOpenFormatWizard}
            readOnly={readOnly}
          />
        ) : null}
      </>
    );
  };

  const renderCustomCard = (collapsedSummary: boolean) => (
    <>
      <SelectionTile
        selected={isCustom}
        onClick={
          readOnly
            ? () => {}
            : () => {
                if (collapsedSummary) {
                  setIsCollapsed(false);
                  return;
                }
                handleSelectCustom();
              }
        }
        icon={Settings2}
        title={t('createGame.presetMeta.CUSTOM')}
        description={t('createGame.intent.advanced.description')}
        topTrailing={
          isCustom ? (
            <CreateTemplateCustomTrailing
              durationContext={durationContext}
              durationLabel={estimateDurationLabelForCustomFormat({
                ...durationContext,
                scoringPreset,
                matchGenerationType: customMatchGenerationType,
                gameType: customGameType,
                matchTimerEnabled: customMatchTimerEnabled,
                matchTimedCapMinutes,
                customPointsTotal: customCustomPointsTotal,
              })}
            />
          ) : undefined
        }
        selectedBody={!collapsedSummary && isCustom && formatSection ? formatSection : undefined}
      />
      {!collapsedSummary && showFormatCustomize && customizeAnchor === 'custom' ? (
        <CreateTemplateCustomizeButton
          label={formatWizardCustomizeLabel!}
          onClick={onOpenFormatWizard}
          readOnly={readOnly}
        />
      ) : null}
    </>
  );

  const renderCardContent = (entry: CardEntry, collapsedSummary: boolean) =>
    entry.kind === 'template'
      ? renderTemplateCard(entry.tpl, collapsedSummary)
      : renderCustomCard(collapsedSummary);

  const visibleCards = effectiveCollapsed ? orderedCards.slice(0, 1) : orderedCards;

  return (
    <div
      ref={sectionRef}
      className={`space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 transition-all duration-300 ease-in-out ${
        effectiveCollapsed ? 'relative z-[5]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <LayoutGrid size={18} className="shrink-0 text-gray-500 dark:text-gray-400" />
          <h2 className="section-title">{t('createGame.intent.title')}</h2>
        </div>
        {hasSelection ? (
          <CreateGameIntentCollapsedBadges
            genderTeams={genderSection ? genderTeams : undefined}
            isRatingGame={isRatingGame}
            showRating={showRatingToggle}
          />
        ) : null}
      </div>
      {templates.length === 0 ? (
        <p className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {t('createGame.intent.noTemplatesForSetup')}
        </p>
      ) : null}
      <LayoutGroup id="create-game-intent-templates">
        <div className="space-y-2">
          <AnimatePresence initial={false} mode={collapsible ? 'popLayout' : undefined}>
            {visibleCards.map((entry) => (
              <motion.div
                key={cardEntryKey(entry)}
                layout={collapsible ? 'position' : false}
                initial={collapsible ? { height: 0, opacity: 0 } : false}
                animate={{ height: 'auto', opacity: 1 }}
                exit={collapsible ? { height: 0, opacity: 0 } : undefined}
                transition={collapsible ? expandTransition : layoutTransition}
                className={collapsible ? 'overflow-hidden' : undefined}
              >
                {renderCardContent(entry, effectiveCollapsed)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </LayoutGroup>
      {!effectiveCollapsed && genderSection ? (
        <div className="-mx-4 border-t border-gray-200 px-4 pt-3 dark:border-gray-800">{genderSection}</div>
      ) : null}
      {!effectiveCollapsed && hasSelection && showRatingToggle ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {t('createGame.ratingGame.title')}
            </span>
            <ToggleSwitch
              checked={isRatingGame}
              onChange={onRatingGameChange}
              disabled={readOnly}
            />
          </div>
        </div>
      ) : null}
      {canCollapse ? (
        <button
          type="button"
          onClick={handleCollapseToggle}
          className="group relative z-10 -mx-2 -mb-2 mt-2 flex w-[calc(100%+1rem)] items-center justify-center rounded-b-xl border-t border-gray-100 py-1 text-gray-400 transition-colors duration-200 hover:bg-gray-50/80 hover:text-gray-600 dark:border-gray-800 dark:hover:bg-gray-800/50 dark:hover:text-gray-300"
          title={effectiveCollapsed ? t('common.expand') : t('common.collapse')}
        >
          <motion.span
            animate={{ rotate: effectiveCollapsed ? 0 : 180 }}
            transition={expandTransition}
            className="transition-transform duration-200 group-active:scale-90"
          >
            <ChevronDown size={18} />
          </motion.span>
        </button>
      ) : null}
    </div>
  );
};
