import { Calendar, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import type { MyGamesViewMode } from '@/utils/myGamesViewStorage';

type Props = {
  mode: MyGamesViewMode;
  onChange: (mode: MyGamesViewMode) => void;
};

export function MyGamesViewModeSwitch({ mode, onChange }: Props) {
  const { t } = useTranslation();

  const tabs: SegmentedSwitchTab[] = [
    { id: 'calendar', label: t('games.calendar'), icon: Calendar },
    { id: 'list', label: t('games.listView'), icon: List },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={mode}
      onChange={(id) => {
        if (id === 'calendar' || id === 'list') {
          onChange(id);
        }
      }}
      showOnlyActiveTabText={true}
      layoutId="myGamesViewMode"
      className="w-fit max-w-full"
      ariaLabel={t('home.myGamesViewMode', { defaultValue: 'Calendar or list games view' })}
    />
  );
}
