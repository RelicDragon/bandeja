import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMarketplaceFromUrl } from '@/hooks/useMarketplaceFromUrl';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const MarketplaceTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { subtab } = useMarketplaceFromUrl();

  const goTo = (id: string) => {
    const tab = id as 'market' | 'my';
    navigate(tab === 'my' ? '/marketplace/my' : '/marketplace', { replace: true });
  };

  const tabs: SegmentedSwitchTab[] = [
    { id: 'market', label: t('bottomTab.marketplace', { defaultValue: 'Market' }) },
    { id: 'my', label: t('marketplace.myShort', { defaultValue: 'My' }) },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={subtab}
      onChange={goTo}
      titleInActiveOnly={false}
      layoutId="marketplaceSubtab"
    />
  );
};
