import { useTranslation } from 'react-i18next';
import { Clock, Settings2 } from 'lucide-react';
import type { CreateTemplate, CreateTemplateId } from '@/sport/createFlow';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import { listTemplatesForParticipantSetup } from '@/sport/createTemplateParticipantFit';
import type { ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { SelectionTile } from '@/components/multisport/SelectionTile';
import { ToggleSwitch } from '../ToggleSwitch';
import { getCreateTemplateAccentClass, getCreateTemplateIcon } from '@/utils/createTemplateVisuals';

type Props = {
  sport: Sport;
  allowedScoringPresets: ScoringPreset[];
  participantContext: CreateTemplateParticipantContext;
  selectedTemplateId: CreateTemplateId | null;
  isCustom: boolean;
  onSelectTemplate: (template: CreateTemplate) => void;
  onSelectCustom: () => void;
  isRatingGame: boolean;
  onRatingGameChange: (checked: boolean) => void;
};

function TierPill({ tier }: { tier: 'social' | 'match' }) {
  const { t } = useTranslation();
  const label = t(`createGame.intent.${tier}.title`);
  const className =
    tier === 'social'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
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
  onSelectTemplate,
  onSelectCustom,
  isRatingGame,
  onRatingGameChange,
}: Props) => {
  const { t } = useTranslation();
  const templates = listTemplatesForParticipantSetup(sport, allowedScoringPresets, participantContext);
  const hasSelection = selectedTemplateId != null || isCustom;

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div>
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('createGame.intent.title')}
        </div>
        <p className="m-0 mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('createGame.intent.subtitle')}
        </p>
      </div>
      {templates.length === 0 ? (
        <p className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {t('createGame.intent.noTemplatesForSetup')}
        </p>
      ) : null}
      <div className="space-y-2">
        {templates.map((tpl) => {
          const Icon = getCreateTemplateIcon(tpl.id);
          const accent = getCreateTemplateAccentClass(tpl.id);
          return (
            <SelectionTile
              key={tpl.id}
              selected={selectedTemplateId === tpl.id}
              onClick={() => onSelectTemplate(tpl)}
              icon={Icon}
              title={t(tpl.labelKey)}
              description={tpl.descriptionKey ? t(tpl.descriptionKey) : undefined}
              badges={<TierPill tier={tpl.tier} />}
              trailing={
                tpl.expectedDurationLabelKey ? (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-medium ${accent}`}
                  >
                    <Clock size={12} aria-hidden />
                    {t(tpl.expectedDurationLabelKey)}
                  </span>
                ) : undefined
              }
            />
          );
        })}
        <SelectionTile
          selected={isCustom}
          onClick={onSelectCustom}
          icon={Settings2}
          title={t('createGame.presetMeta.CUSTOM')}
          description={t('createGame.intent.advanced.description')}
        />
      </div>
      {hasSelection ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {t('createGame.ratingGame.title')}
            </span>
            <ToggleSwitch checked={isRatingGame} onChange={onRatingGameChange} />
          </div>
        </div>
      ) : null}
    </div>
  );
};
