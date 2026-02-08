import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components';
import { useAuthStore } from '@/store/authStore';

export const MarketplaceListHeaderTitle = () => {
  const { t } = useTranslation();
  return (
    <h1 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
      <ShoppingBag size={20} />
      {t('bottomTab.marketplace', { defaultValue: 'Market' })}
    </h1>
  );
};

export const MarketplaceListHeaderActions = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  return (
    <Button
      variant="primary"
      size="sm"
      onClick={() => navigate('/marketplace/create')}
      className="flex items-center gap-2"
    >
      <Plus size={16} />
      {t('marketplace.sell', { defaultValue: 'Sell' })}
    </Button>
  );
};
