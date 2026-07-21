import { useTranslation } from 'react-i18next';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import type { LeaderboardGenderFilter } from '@/components/leaderboard/leaderboardGender';

export type LeaderboardGenderFilterValue = LeaderboardGenderFilter;

type LeaderboardGenderFilterProps = {
  value: LeaderboardGenderFilterValue;
  onChange: (value: LeaderboardGenderFilterValue) => void;
};

export function LeaderboardGenderFilter({ value, onChange }: LeaderboardGenderFilterProps) {
  const { t } = useTranslation();

  const tabs: SegmentedSwitchTab[] = [
    { id: 'all', label: t('playerInvite.genderAll', { defaultValue: 'All' }) },
    { id: 'men', label: t('playerInvite.genderMale', { defaultValue: 'Men' }) },
    { id: 'women', label: t('playerInvite.genderFemale', { defaultValue: 'Women' }) },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={value}
      onChange={(id) => onChange(id as LeaderboardGenderFilterValue)}
      showOnlyActiveTabText={false}
      layoutId="leaderboardGender"
      fullWidth
      ariaLabel={t('profile.gender', { defaultValue: 'Gender' })}
    />
  );
}
