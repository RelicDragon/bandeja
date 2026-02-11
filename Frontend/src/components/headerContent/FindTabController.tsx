import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFindFromUrl } from '@/hooks/useFindFromUrl';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const FindTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { view } = useFindFromUrl();

  const handleViewChange = (id: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (id === 'calendar') {
      newParams.delete('view');
    } else {
      newParams.set('view', id);
    }
    const qs = newParams.toString();
    navigate(qs ? `/find?${qs}` : '/find', { replace: true });
  };

  const tabs: SegmentedSwitchTab[] = [
    { id: 'calendar', label: t('games.calendar', { defaultValue: 'Calendar' }) },
    { id: 'list', label: t('games.list', { defaultValue: 'List' }) },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={view}
      onChange={handleViewChange}
      titleInActiveOnly={false}
      layoutId="findSubtab"
    />
  );
};
