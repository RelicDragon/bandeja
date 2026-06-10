import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function BooktimeBookingsLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 py-4 justify-center text-sm text-gray-500 dark:text-gray-400">
      <Loader2 size={16} className="animate-spin" />
      {t('common.loading')}
    </div>
  );
}
