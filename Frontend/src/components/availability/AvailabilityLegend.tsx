import { useTranslation } from 'react-i18next';

export const AvailabilityLegend = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-[3px] bg-gradient-to-br from-primary-500 to-primary-600 shadow-sm" />
        <span>{t('profile.availability.legend.available')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-[3px] bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600" />
        <span>{t('profile.availability.legend.unavailable')}</span>
      </div>
    </div>
  );
};
