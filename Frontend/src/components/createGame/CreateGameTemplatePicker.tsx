import { useTranslation } from 'react-i18next';
import type { CreateFlowIntent, CreateTemplate, CreateTemplateId } from '@/sport/createFlow';
import { listTemplatesForIntent } from '@/sport/createFlow';
import type { ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { getSportPublicIcon } from '@/sport/sportPublicIcon';
import { SelectionTile } from '@/components/multisport/SelectionTile';
import { getCreateTemplateIcon } from '@/utils/createTemplateVisuals';
import { CreateTemplateCardTrailing } from './CreateTemplateCardTrailing';
import type { CreateTemplateDurationContext } from './createTemplateDurationLabels';

type Props = {
  sport: Sport;
  intent: Exclude<CreateFlowIntent, 'advanced'>;
  allowedScoringPresets: ScoringPreset[];
  selectedId: CreateTemplateId | null;
  onSelect: (template: CreateTemplate) => void;
  embedded?: boolean;
  durationContext: CreateTemplateDurationContext;
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

export const CreateGameTemplatePicker = ({
  sport,
  intent,
  allowedScoringPresets,
  selectedId,
  onSelect,
  embedded = false,
  durationContext,
}: Props) => {
  const { t } = useTranslation();
  const templates = listTemplatesForIntent(sport, intent, allowedScoringPresets);
  const sportIcon = getSportPublicIcon(sport);

  if (templates.length === 0) {
    return (
      <div
        className={
          embedded
            ? 'rounded-lg border border-dashed border-gray-300 p-3 text-center dark:border-gray-600'
            : 'rounded-xl border border-dashed border-gray-300 p-4 text-center dark:border-gray-600'
        }
      >
        <p className="m-0 text-xs text-gray-500 dark:text-gray-400">{t('createGame.templates.empty')}</p>
      </div>
    );
  }

  const content = (
    <>
      {!embedded ? (
        <div className="flex items-center gap-2">
          <img src={sportIcon} alt="" className="h-6 w-6 object-contain" draggable={false} />
          <h2 className="section-title">
            {t('createGame.templates.title')}
          </h2>
        </div>
      ) : null}
      <div className="space-y-2">
        {templates.map((tpl) => {
          const Icon = getCreateTemplateIcon(tpl.id);
          return (
            <SelectionTile
              key={tpl.id}
              selected={selectedId === tpl.id}
              onClick={() => onSelect(tpl)}
              icon={Icon}
              title={t(tpl.labelKey)}
              description={tpl.descriptionKey ? t(tpl.descriptionKey) : undefined}
              badges={<TierPill tier={tpl.tier} />}
              topTrailing={
                <CreateTemplateCardTrailing tpl={tpl} durationContext={durationContext} />
              }
            />
          );
        })}
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-2">{content}</div>;
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      {content}
    </div>
  );
};
