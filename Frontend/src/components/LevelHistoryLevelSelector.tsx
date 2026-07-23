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
  /** When false, competitive sports are omitted (shown elsewhere). */
  includeSports?: boolean;
  includeSocial?: boolean;
  /** Used to leave social mode when sports live in an external picker. */
  competitiveSport?: Sport;
};

export function LevelHistoryLevelSelector({
  sports,
  value,
  onChange,
  embedded = false,
  tone = 'neutral',
  includeSports = true,
  includeSocial = true,
  competitiveSport,
}: LevelHistoryLevelSelectorProps) {
  const { t } = useTranslation();

  const tabs = useMemo<SegmentedSwitchTab[]>(() => {
    const next: SegmentedSwitchTab[] = [];
    if (includeSports) {
      for (const sport of sports) {
        next.push({
          id: sport,
          label: t(getSportConfig(sport).labelKey),
          icon: () => <SportPublicIcon sport={sport} className="h-5 w-5 shrink-0 object-contain" />,
        });
      }
    }
    if (includeSocial) {
      next.push({
        id: 'social',
        label: t('rating.socialLevel'),
        icon: SocialLevelIcon,
      });
    }
    return next;
  }, [includeSocial, includeSports, sports, t]);

  if (tabs.length === 0) {
    return null;
  }

  const socialOnly = !includeSports && includeSocial;
  const restoreSport = competitiveSport ?? sports[0];
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

  const layoutId = `level-history-sport-${embedded ? 'embedded' : 'standalone'}-${tone}${socialOnly ? '-social' : ''}`;

  if (socialOnly) {
    return (
      <div className={`flex justify-center ${wrapperClass}`.trim()}>
        <SegmentedSwitch
          tabs={tabs}
          allowDeselect
          activeId={value.kind === 'social' ? 'social' : null}
          onChange={(id) => {
            if (id === 'social') {
              onChange({ kind: 'social' });
              return;
            }
            if (restoreSport) {
              onChange({ kind: 'competitive', sport: restoreSport });
            }
          }}
          showOnlyActiveTabText={false}
          layoutId={layoutId}
          className={switchClass}
          ariaLabel={t('playerCard.levelHistorySelector')}
        />
      </div>
    );
  }

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
        layoutId={layoutId}
        className={switchClass}
        ariaLabel={t('playerCard.levelHistorySelector')}
      />
    </div>
  );
}
