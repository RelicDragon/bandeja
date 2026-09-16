import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeftRight, Loader2 } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';

interface SubstituteConfirmStepProps {
  outUser: BasicUser;
  inUser: BasicUser;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

function displayName(user: BasicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

/**
 * The substitute inherits the seat outright, including matches already scored, so the
 * consequences are spelled out before committing.
 */
export const SubstituteConfirmStep = ({
  outUser,
  inUser,
  submitting,
  onBack,
  onConfirm,
}: SubstituteConfirmStepProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={outUser} showName={false} fullHideName extrasmall />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              {t('gameDetails.substitutePlayerOut')}
            </p>
            <p className="text-sm font-medium text-gray-900 line-through dark:text-white">
              {displayName(outUser)}
            </p>
          </div>
          <ArrowLeftRight size={16} className="shrink-0 text-primary-500" />
          <div className="min-w-0 flex-1 text-end">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              {t('gameDetails.substitutePlayerIn')}
            </p>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {displayName(inUser)}
            </p>
          </div>
          <PlayerAvatar player={inUser} showName={false} fullHideName extrasmall />
        </div>
      </div>

      <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
        <li className="flex gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
          {t('gameDetails.substitutePlayerInheritsResults', { name: displayName(inUser) })}
        </li>
        <li className="flex gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
          {t('gameDetails.substitutePlayerOutLosesResults', { name: displayName(outUser) })}
        </li>
        <li className="flex gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
          {t('gameDetails.substitutePlayerKeepsTeamSlot')}
        </li>
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {t('common.back')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
          {t('gameDetails.substitutePlayerConfirm')}
        </button>
      </div>
    </div>
  );
};
