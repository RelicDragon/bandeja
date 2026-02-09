import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/store/navigationStore';

export const MarketplaceTabController = () => {
  const { t } = useTranslation();
  const { marketplaceTab, setMarketplaceTab } = useNavigationStore();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => setMarketplaceTab('market')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          marketplaceTab === 'market'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('bottomTab.marketplace', { defaultValue: 'Market' })}
      </button>
      <button
        onClick={() => setMarketplaceTab('my')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          marketplaceTab === 'my'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('marketplace.myShort', { defaultValue: 'My' })}
      </button>
    </div>
  );
};
