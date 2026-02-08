import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

export const MarketplaceCreateHeaderContent = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const isEdit = location.pathname.match(/^\/marketplace\/[^/]+\/edit$/);

  return (
    <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
      {isEdit ? t('marketplace.editListing', { defaultValue: 'Edit listing' }) : t('marketplace.createListing', { defaultValue: 'Create listing' })}
    </h1>
  );
};
