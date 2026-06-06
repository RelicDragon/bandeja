import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { SocialLevelIcon } from '@/components/profile/SocialLevelIcon';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export type LevelHistorySelection =
  | { kind: 'competitive'; sport: Sport }
  | { kind: 'social' };

type LevelHistoryLevelSelectorProps = {
  sports: Sport[];
  value: LevelHistorySelection;
  onChange: (value: LevelHistorySelection) => void;
  embedded?: boolean;
  tone?: 'neutral' | 'onGradient';
};

export function LevelHistoryLevelSelector({
  sports,
  value,
  onChange,
  embedded = false,
  tone = 'neutral',
}: LevelHistoryLevelSelectorProps) {
  const { t } = useTranslation();

  const tabs = useMemo<SegmentedSwitchTab[]>(() => {
    const sportTabs: SegmentedSwitchTab[] = sports.map((sport) => ({
      id: sport,
      label: t(getSportConfig(sport).labelKey),
      icon: () => <SportPublicIcon sport={sport} className="h-5 w-5 shrink-0 object-contain" />,
    }));
    sportTabs.push({
      id: 'social',
      label: t('rating.socialLevel'),
      icon: SocialLevelIcon,
    });
    return sportTabs;
  }, [sports, t]);

  if (sports.length === 0) {
    return null;
  }

  const activeId = value.kind === 'social' ? 'social' : value.sport;

  const wrapperClass = embedded
    ? tone === 'onGradient'
      ? 'p-2 pb-0'
      : 'p-1.5 pb-0 border-b border-gray-200/60 dark:border-gray-600/50'
    : '';

  const switchClass =
    tone === 'onGradient'
      ? '!mx-0 bg-black/15 dark:bg-black/20'
      : embedded
        ? '!mx-0'
        : '';

  return (
    <div className={`flex justify-center ${wrapperClass}`.trim()}>
      <SegmentedSwitch
        tabs={tabs}
        activeId={activeId}
        onChange={(id) => {
          if (id === 'social') onChange({ kind: 'social' });
          else onChange({ kind: 'competitive', sport: id as Sport });
        }}
        showOnlyActiveTabText
        layoutId={`level-history-sport-${embedded ? 'embedded' : 'standalone'}-${tone}`}
        className={switchClass}
        ariaLabel={t('playerCard.levelHistorySelector')}
      />
    </div>
  );
}
