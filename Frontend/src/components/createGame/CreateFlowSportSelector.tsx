import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

type CreateFlowSportSelectorProps = {
  sports: Sport[];
  value: Sport;
  onChange: (sport: Sport) => void;
  showLabel?: boolean;
  defaultSport?: Sport;
};

export function CreateFlowSportSelector({
  sports,
  value,
  onChange,
  showLabel = true,
  defaultSport,
}: CreateFlowSportSelectorProps) {
  const { t } = useTranslation();
  const title = t('sport.sport', { defaultValue: 'Sport' });

  const sortedSports = useMemo(() => {
    if (sports.length <= 1) return sports;
    if (!defaultSport) return sports;
    return [...sports].sort((a, b) => {
      if (a === defaultSport) return -1;
      if (b === defaultSport) return 1;
      return 0;
    });
  }, [sports, defaultSport]);

  const sportTabs = useMemo<SegmentedSwitchTab[]>(
    () =>
      sortedSports.map((sport) => {
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
      }),
    [sortedSports, defaultSport, t],
  );

  if (sports.length <= 1) {
    return null;
  }

  return (
    <div>
      {showLabel && (
        <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      )}
      <div className="flex justify-center">
        <SegmentedSwitch
          tabs={sportTabs}
          activeId={value}
          onChange={(id) => onChange(id as Sport)}
          showOnlyActiveTabText={sortedSports.length > 2}
          layoutId="create-flow-sport-selector"
          ariaLabel={title}
        />
      </div>
    </div>
  );
}
