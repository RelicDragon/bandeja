import { Activity } from 'lucide-react';
import type { TFunction } from 'i18next';
import { ratingUncertaintyScale } from '@/utils/ratingUncertainty';

type PlayerCardRatingStatusProps = {
  settling: boolean;
  /** Raw uncertainty — only pass when viewer is admin */
  uncertainty?: number | null;
  t: TFunction;
  className?: string;
};

export function PlayerCardRatingStatus({
  settling,
  uncertainty,
  t,
  className = '',
}: PlayerCardRatingStatusProps) {
  const showAdminDetail = uncertainty != null && uncertainty > 0;
  if (!settling && !showAdminDetail) return null;

  return (
    <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${className}`}>
      {settling && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm"
          title={t('rating.settling')}
        >
          <Activity size={12} className="opacity-90" aria-hidden />
          {t('rating.settling')}
        </span>
      )}
      {showAdminDetail && (
        <span
          className="inline-flex items-center rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white/95 ring-1 ring-white/15 backdrop-blur-sm"
          title={t('rating.uncertainty')}
        >
          {t('rating.uncertainty')} {uncertainty!.toFixed(0)} ·{' '}
          {ratingUncertaintyScale(uncertainty!).toFixed(2)}×
        </span>
      )}
    </div>
  );
}
