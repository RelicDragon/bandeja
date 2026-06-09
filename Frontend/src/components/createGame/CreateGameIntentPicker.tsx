import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { LayoutGroup, motion } from 'framer-motion';
import type { CreateTemplate, CreateTemplateId } from '@/sport/createFlow';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import { listTemplatesForParticipantSetup } from '@/sport/createTemplateParticipantFit';
import type { GameType, MatchGenerationType, ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { SelectionTile } from '@/components/multisport/SelectionTile';
import { getCreateTemplateIcon } from '@/utils/createTemplateVisuals';
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

export type FormatCustomizeAnchor = CreateTemplateId | 'custom';

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
}: Props) => {
  const { t } = useTranslation();
  const templates = listTemplatesForParticipantSetup(sport, allowedScoringPresets, participantContext);
  const hasSelection = selectedTemplateId != null || isCustom;
  const customizeAnchor: FormatCustomizeAnchor | null = isCustom
    ? 'custom'
    : selectedTemplateId;
  const showFormatCustomize =
    customizeAnchor != null && !!formatWizardCustomizeLabel && !!onOpenFormatWizard;

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="section-title">
        {t('createGame.intent.title')}
      </h2>
      {templates.length === 0 ? (
        <p className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {t('createGame.intent.noTemplatesForSetup')}
        </p>
      ) : null}
      <LayoutGroup id="create-game-intent-templates">
      <div className="space-y-2">
        {templates.map((tpl) => {
          const Icon = getCreateTemplateIcon(tpl.id);
          const selected = !isCustom && selectedTemplateId === tpl.id;
          const showPointsPicker = selected && tpl.inlineConfig?.type === 'points_total';
          const timedOptions =
            tpl.inlineConfig?.type === 'timed_duration' ? tpl.inlineConfig.options : ([10, 15, 20] as const);
          const showTimedPicker = selected && tpl.inlineConfig?.type === 'timed_duration';
          const hasInlinePanel = showPointsPicker || showTimedPicker;
          return (
            <div key={tpl.id}>
              <motion.div
                layout="position"
                transition={{ duration: 0.22, ease: 'easeInOut' }}
              >
                <SelectionTile
                  selected={selected}
                  onClick={readOnly ? () => {} : () => onSelectTemplate(tpl)}
                  icon={Icon}
                  title={t(tpl.labelKey)}
                  description={tpl.descriptionKey ? t(tpl.descriptionKey) : undefined}
                  badges={<TierPill tier={tpl.tier} labelKey={tpl.badgeLabelKey} variant={tpl.badgeVariant} />}
                  className={
                    hasInlinePanel
                      ? 'rounded-b-none border-b-0 transition-[border-radius] duration-200'
                      : undefined
                  }
                  topTrailing={
                    <CreateTemplateCardTrailing tpl={tpl} durationContext={durationContext} />
                  }
                />
              </motion.div>
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
              {showFormatCustomize && customizeAnchor === tpl.id ? (
                <CreateTemplateCustomizeButton
                  label={formatWizardCustomizeLabel!}
                  onClick={onOpenFormatWizard}
                  readOnly={readOnly}
                />
              ) : null}
            </div>
          );
        })}
        {showManualCard ? (
          <motion.div layout="position" transition={{ duration: 0.22, ease: 'easeInOut' }}>
            <SelectionTile
              selected={isCustom}
              onClick={readOnly ? () => {} : onSelectCustom}
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
              selectedBody={isCustom && formatSection ? formatSection : undefined}
            />
            {showFormatCustomize && customizeAnchor === 'custom' ? (
              <CreateTemplateCustomizeButton
                label={formatWizardCustomizeLabel!}
                onClick={onOpenFormatWizard}
                readOnly={readOnly}
              />
            ) : null}
          </motion.div>
        ) : null}
      </div>
      </LayoutGroup>
      {genderSection ? (
        <div className="-mx-4 border-t border-gray-200 px-4 pt-3 dark:border-gray-800">{genderSection}</div>
      ) : null}
      {hasSelection && showRatingToggle ? (
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
    </div>
  );
};
