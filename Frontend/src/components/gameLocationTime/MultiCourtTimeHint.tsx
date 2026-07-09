import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type MultiCourtTimeHintProps = {
  requiredCourtCount: number;
  integratedCourtCount: number;
  hasTimeSlots: boolean;
  booktimeSlotsActive: boolean;
};

export function MultiCourtTimeHint({
  requiredCourtCount,
  integratedCourtCount,
  hasTimeSlots,
  booktimeSlotsActive,
}: MultiCourtTimeHintProps) {
  const { t } = useTranslation();

  if (!booktimeSlotsActive || requiredCourtCount <= 1) return null;

  if (integratedCourtCount < requiredCourtCount) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
        {t('createGame.multiCourtNeedSharedSlots', { count: requiredCourtCount })}
      </div>
    );
  }

  if (!hasTimeSlots) {
    return (
      <div className="flex gap-2.5 rounded-lg border border-dashed border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
        <Clock size={18} className="mt-0.5 shrink-0" aria-hidden />
        <p>{t('createGame.multiCourtNoSharedSlots', { count: requiredCourtCount })}</p>
      </div>
    );
  }

  return null;
}
