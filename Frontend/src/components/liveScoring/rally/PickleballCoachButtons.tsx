import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { PickleballKitchenFaultButton } from './PickleballKitchenFaultButton';

function CoachHintButton({ labelKey, hintKey }: { labelKey: string; hintKey: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="rounded-full border border-amber-700/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-500/20 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-50 dark:hover:bg-amber-500/25"
      onClick={() => {
        toast(t(hintKey), { icon: 'ℹ️', duration: 4500 });
      }}
    >
      {t(labelKey)}
    </button>
  );
}

export function PickleballCoachButtons() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <PickleballKitchenFaultButton />
      <CoachHintButton
        labelKey="gameDetails.liveScoring.pickleballUnderhandServe"
        hintKey="gameDetails.liveScoring.pickleballUnderhandServeHint"
      />
      <CoachHintButton
        labelKey="gameDetails.liveScoring.pickleballSideOut"
        hintKey="gameDetails.liveScoring.pickleballSideOutHint"
      />
      <CoachHintButton
        labelKey="gameDetails.liveScoring.pickleballTwoBounce"
        hintKey="gameDetails.liveScoring.pickleballTwoBounceHint"
      />
    </div>
  );
}
