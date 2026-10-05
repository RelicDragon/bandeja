import { Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type NewPlayersBroughtStatProps = {
  count: number | null | undefined;
  /** `onPrimary` sits on the player-card gradient; `surface` on a page card. */
  variant?: 'onPrimary' | 'surface';
};

/**
 * PRD 358 — organizer credit: "Brought N new players" (users whose first
 * counted game this person hosted, `newPlayersBroughtCount`). Hidden at 0.
 */
export function NewPlayersBroughtStat({ count, variant = 'surface' }: NewPlayersBroughtStatProps) {
  const { t } = useTranslation();
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  const tone =
    variant === 'onPrimary'
      ? 'bg-white/15 text-white ring-1 ring-white/25'
      : 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-100 dark:ring-emerald-400/25';
  return (
    <span
      data-testid="new-players-brought"
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${tone}`}
    >
      <Sprout size={13} aria-hidden />
      {t('novice.organizer.broughtPlayers', { count })}
    </span>
  );
}
