import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Beer, Star } from 'lucide-react';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export type PlayIntentActivityId = Sport | 'BAR';

type Props = {
  sports: Sport[];
  value: PlayIntentActivityId;
  onChange: (value: PlayIntentActivityId) => void;
  defaultSport?: Sport;
  layoutId?: string;
};

export function PlayIntentActivitySelector({
  sports,
  value,
  onChange,
  defaultSport,
  layoutId = 'play-intent-activity',
}: Props) {
  const { t } = useTranslation();

  const sortedSports = useMemo(() => {
    if (sports.length <= 1) return sports;
    if (!defaultSport) return sports;
    return [...sports].sort((a, b) => {
      if (a === defaultSport) return -1;
      if (b === defaultSport) return 1;
      return 0;
    });
  }, [sports, defaultSport]);

  const tabs = useMemo<SegmentedSwitchTab[]>(() => {
    const sportTabs = sortedSports.map((sport) => {
      const isDefaultSport = sport === defaultSport;
      return {
        id: sport,
        label: t(getSportConfig(sport).labelKey),
        icon: () =>
          isDefaultSport ? (
            <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
              <SportPublicIcon sport={sport} className="h-5 w-5 object-contain" />
              <Star size={10} className="absolute -left-1 -top-1 fill-amber-500 text-amber-500" />
            </span>
          ) : (
            <SportPublicIcon sport={sport} className="h-5 w-5 shrink-0 object-contain" />
          ),
      };
    });
    return [
      ...sportTabs,
      {
        id: 'BAR',
        label: t('games.entityTypes.BAR', { defaultValue: 'Bar' }),
        icon: Beer,
      },
    ];
  }, [sortedSports, defaultSport, t]);

  if (sports.length < 1) return null;

  return (
    <div className="flex justify-center">
      <SegmentedSwitch
        className="!mx-0 max-w-full"
        tabs={tabs}
        activeId={value}
        onChange={(id) => onChange(id as PlayIntentActivityId)}
        showOnlyActiveTabText={tabs.length > 2}
        layoutId={layoutId}
        ariaLabel={t('playIntent.activityLabel', { defaultValue: 'Activity' })}
      />
    </div>
  );
}
