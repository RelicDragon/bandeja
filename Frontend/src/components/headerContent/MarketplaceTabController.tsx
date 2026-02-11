import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNavigationStore } from '@/store/navigationStore';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const MarketplaceTabController = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const setMarketplaceTab = useNavigationStore((s) => s.setMarketplaceTab);
  const isMy = location.pathname === '/marketplace/my';
  const activeId = isMy ? 'my' : 'market';

  const goTo = (id: string) => {
    const tab = id as 'market' | 'my';
    setMarketplaceTab(tab);
    navigate(tab === 'my' ? '/marketplace/my' : '/marketplace');
  };

  const tabs: SegmentedSwitchTab[] = [
    { id: 'market', label: t('bottomTab.marketplace', { defaultValue: 'Market' }) },
    { id: 'my', label: t('marketplace.myShort', { defaultValue: 'My' }) },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={activeId}
      onChange={goTo}
      titleInActiveOnly={false}
      layoutId="marketplaceSubtab"
    />
  );
};
