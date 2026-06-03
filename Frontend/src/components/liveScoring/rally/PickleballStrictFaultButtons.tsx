import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LiveTeamSide } from '@/utils/liveScoring';

type PickleballStrictFaultButtonsProps = {
  onKitchenFault: (faultingTeam: LiveTeamSide) => void;
  disabled?: boolean;
};

export function PickleballStrictFaultButtons({ onKitchenFault, disabled }: PickleballStrictFaultButtonsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        className="rounded-full border border-amber-400/60 bg-gradient-to-r from-amber-100 to-orange-100 px-3.5 py-1.5 text-xs font-semibold text-amber-900 shadow-sm transition hover:from-amber-200 hover:to-orange-200 disabled:opacity-50 dark:border-amber-500/50 dark:from-amber-900/30 dark:to-orange-900/30 dark:text-amber-100"
        onClick={() => setOpen(true)}
      >
        {t('gameDetails.liveScoring.pickleballKitchenFault')}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50/80 p-2 dark:border-amber-700/50 dark:bg-amber-950/30">
      <span className="text-xs font-medium text-amber-900/90 dark:text-amber-100/90">
        {t('gameDetails.liveScoring.strictKitchenFaultPickTeam')}
      </span>
      <button
        type="button"
        disabled={disabled}
        className="rounded-full border border-sky-300/70 bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 shadow-sm dark:border-sky-700/60 dark:bg-sky-900/40 dark:text-sky-100"
        onClick={() => {
          onKitchenFault('teamA');
          setOpen(false);
        }}
      >
        {t('gameDetails.liveScoring.teamAFault')}
      </button>
      <button
        type="button"
        disabled={disabled}
        className="rounded-full border border-violet-300/70 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 shadow-sm dark:border-violet-700/60 dark:bg-violet-900/40 dark:text-violet-100"
        onClick={() => {
          onKitchenFault('teamB');
          setOpen(false);
        }}
      >
        {t('gameDetails.liveScoring.teamBFault')}
      </button>
      <button type="button" className="text-xs underline opacity-80" onClick={() => setOpen(false)}>
        {t('common.cancel')}
      </button>
    </div>
  );
}
