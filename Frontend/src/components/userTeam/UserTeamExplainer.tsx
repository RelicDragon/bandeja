import { UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  pending: boolean;
};

export function UserTeamExplainer({ pending }: Props) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="user-team-explainer"
      className="rounded-2xl border border-zinc-200/90 bg-zinc-50/90 px-3.5 py-3 dark:border-zinc-700/80 dark:bg-zinc-900/50"
    >
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm shadow-primary-600/20">
          <UsersRound size={18} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t('teams.explainerTitle')}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">
            {pending ? t('teams.explainerPagePending') : t('teams.explainerPage')}
          </p>
        </div>
      </div>
    </div>
  );
}
