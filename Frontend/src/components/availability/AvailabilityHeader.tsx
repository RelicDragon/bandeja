import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';

interface AvailabilityHeaderProps {
  isDefault: boolean;
  isEmptyWeek: boolean;
  status: 'idle' | 'saving' | 'saved' | 'error';
}

export const AvailabilityHeader = ({ isDefault, isEmptyWeek, status }: AvailabilityHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight flex items-center gap-2">
        {t('profile.availability.title')}
        {isDefault ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            24/7
          </span>
        ) : isEmptyWeek ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/20 max-w-[min(100%,12rem)] truncate">
            {t('profile.availability.neverAvailable')}
          </span>
        ) : null}
        {status === 'saving' && (
          <Loader2 size={14} className="animate-spin text-primary-600 dark:text-primary-400" />
        )}
        {status === 'saved' && (
          <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
        )}
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {t('profile.availability.description')}
      </p>
    </div>
  );
};
