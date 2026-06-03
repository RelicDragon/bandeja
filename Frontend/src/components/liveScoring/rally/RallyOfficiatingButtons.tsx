import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { OfficiatingLevel } from '@shared/officiatingLevel';
import { officiatingShowsHonorHints, officiatingIsStrict } from '@shared/officiatingLevel';

type RallyOfficiatingButtonsProps = {
  level: OfficiatingLevel;
  letPending?: boolean;
  disabled?: boolean;
  onLet?: () => void;
  onLetReplay?: () => void;
  onServiceFault?: () => void;
};

function HonorButton({ labelKey, hintKey }: { labelKey: string; hintKey: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="rounded-full border border-slate-300/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-500/40 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-800/70"
      onClick={() => toast(t(hintKey), { icon: 'ℹ️', duration: 4500 })}
    >
      {t(labelKey)}
    </button>
  );
}

export function RallyOfficiatingButtons({
  level,
  letPending,
  disabled,
  onLet,
  onLetReplay,
  onServiceFault,
}: RallyOfficiatingButtonsProps) {
  const { t } = useTranslation();

  if (officiatingShowsHonorHints(level)) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2 dark:border-slate-700/70 dark:bg-slate-900/50">
        <HonorButton labelKey="gameDetails.liveScoring.let" hintKey="gameDetails.liveScoring.letHint" />
        <HonorButton labelKey="gameDetails.liveScoring.serviceFault" hintKey="gameDetails.liveScoring.serviceFaultHint" />
      </div>
    );
  }

  if (!officiatingIsStrict(level)) return null;

  if (letPending) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50/70 p-2 dark:border-amber-700/60 dark:bg-amber-950/30">
        <p className="text-center text-xs font-medium text-amber-800 dark:text-amber-100">
          {t('gameDetails.liveScoring.strictLetPending')}
        </p>
        <button
          type="button"
          disabled={disabled}
          className="rounded-full border border-emerald-500/50 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm dark:text-emerald-50"
          onClick={onLetReplay}
        >
          {t('gameDetails.liveScoring.strictLetReplay')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 dark:border-slate-700/70 dark:bg-slate-900/40">
      <button
        type="button"
        disabled={disabled}
        className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-50 dark:border-slate-500 dark:bg-slate-900/70 dark:text-slate-100"
        onClick={onLet}
      >
        {t('gameDetails.liveScoring.let')}
      </button>
      <button
        type="button"
        disabled={disabled}
        className="rounded-full border border-red-400/50 bg-red-100 px-3.5 py-1.5 text-xs font-semibold text-red-800 shadow-sm disabled:opacity-50 dark:border-red-700/60 dark:bg-red-900/35 dark:text-red-100"
        onClick={onServiceFault}
      >
        {t('gameDetails.liveScoring.serviceFault')}
      </button>
    </div>
  );
}
