import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { pressScaleGuard } from '@/components/motion/pressScale';

export type UserTeamManageAction = {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Second line, e.g. the partner the action applies to. */
  detail?: string;
  danger?: boolean;
  onClick: () => void;
  testId?: string;
};

type Props = {
  actions: UserTeamManageAction[];
  disabled?: boolean;
};

/**
 * The quiet bottom block of `/user-team/:id`: every membership change (cancel
 * invite, remove partner, leave, delete) in one grouped list, each confirmed by
 * a modal. Keeping them here instead of on the faces up top means the hero is
 * safe to tap.
 */
export function UserTeamManageList({ actions, disabled }: Props) {
  const { t } = useTranslation();
  if (actions.length === 0) return null;

  return (
    <section aria-labelledby="user-team-manage-title" className="pt-2">
      <h2
        id="user-team-manage-title"
        className="mb-2 px-4 text-xs font-medium text-zinc-500 dark:text-zinc-400"
      >
        {t('teams.manage')}
      </h2>
      <ul className="overflow-hidden rounded-[1.5rem] bg-[var(--ui-surface)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
        {actions.map(({ key, icon: Icon, label, detail, danger, onClick, testId }, i) => (
          <li key={key} className={i > 0 ? 'border-t border-zinc-100 dark:border-zinc-800' : undefined}>
            <button
              type="button"
              onClick={onClick}
              disabled={disabled}
              data-testid={testId}
              className={`flex min-h-[3.5rem] w-full items-center gap-3 px-4 py-2.5 text-start outline-none transition-[background-color,scale] duration-150 hover:bg-zinc-50 focus-visible:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 dark:hover:bg-white/[0.03] dark:focus-visible:bg-white/[0.03] ${pressScaleGuard}`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  danger
                    ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                <Icon size={18} strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-semibold tracking-tight ${
                    danger ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-50'
                  }`}
                >
                  {label}
                </span>
                {detail ? (
                  <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">{detail}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
