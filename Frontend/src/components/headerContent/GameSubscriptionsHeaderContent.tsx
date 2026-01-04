import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';

export const GameSubscriptionsHeaderContent = () => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <Bell size={20} className="text-gray-900 dark:text-white" />
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
        {t('gameSubscriptions.title') || 'Game Subscriptions'}
      </h1>
    </div>
  );
};

