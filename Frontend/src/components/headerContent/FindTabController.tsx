import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/store/navigationStore';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const FindTabController = () => {
  const { t } = useTranslation();
  const { findViewMode, setFindViewMode } = useNavigationStore();

  const tabs: SegmentedSwitchTab[] = [
    { id: 'calendar', label: t('games.calendar', { defaultValue: 'Calendar' }) },
    { id: 'list', label: t('games.list', { defaultValue: 'List' }) },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={findViewMode}
      onChange={(id) => setFindViewMode(id as 'calendar' | 'list')}
      titleInActiveOnly={false}
      layoutId="findSubtab"
    />
  );
};
