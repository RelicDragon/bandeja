import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { UserX } from 'lucide-react';
import { PremiumName } from '@/components/PremiumName';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { rowStatusLabelKey, type RosterRowModel } from './rosterModel';
import { RosterAvatar } from './RosterAvatar';
import { MoneyPill, type MoneyPillToggle } from './RosterMoney';
import { RosterRowMenu, type RosterRowMenuItem } from './RosterRowMenu';
import { MENU_SLOT, ROW_SURFACE, ROW_TRAILING, STATUS_TONE } from './rosterTones';

export interface RosterRowMoney {
  amount: string;
  /** `null` = a plain pill (the payer's own share, or the viewer is not the payer). */
  toggle: MoneyPillToggle | null;
}

function displayName(row: RosterRowModel): string {
  return `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim();
}

/**
 * The second line of a row: the answer in words, or the grey no-show tag.
 * Deliberately no "paid the club" chrome on the payer (GD-CS-04).
 */
function RosterStatusLine({ row }: { row: RosterRowModel }) {
  const { t } = useTranslation();
  if (row.attendance === 'NO_SHOW') {
    return (
      <p className="mt-0.5">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-200/80 px-1.5 py-px text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          <UserX size={11} aria-hidden />
          {t('attendance.noShow.tag')}
        </span>
      </p>
    );
  }
  if (row.attendance) {
    return (
      <p className={`mt-0.5 truncate text-xs ${STATUS_TONE[row.attendance]}`}>
        {t(rowStatusLabelKey(row) ?? '')}
      </p>
    );
  }
  return row.user.verbalStatus ? <p className="verbal-status">{row.user.verbalStatus}</p> : null;
}

export const RosterRow = memo(function RosterRow({
  row,
  crownRole,
  money,
  menuItems,
  flashing,
  reserveMenu,
  onLegend,
}: {
  row: RosterRowModel;
  crownRole?: 'OWNER' | 'ADMIN' | 'PLAYER';
  money: RosterRowMoney | null;
  menuItems: RosterRowMenuItem[];
  flashing: boolean;
  /** Another row has a ⋮ — keep its slot so every pill lines up. */
  reserveMenu: boolean;
  onLegend?: () => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const name = displayName(row);
  const hasMenu = menuItems.length > 0;
  const hasTrailing = Boolean(money && row.share) || hasMenu;
  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
      className={`${ROW_SURFACE} transition-colors duration-300 ${
        flashing ? '!bg-green-50 dark:!bg-green-500/10' : ''
      }`}
      data-roster-row={row.userId}
    >
      <RosterAvatar user={row.user} attendance={row.attendance} role={crownRole} onLegend={onLegend} />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
          <PremiumName user={row.user}>{name}</PremiumName>
        </p>
        <RosterStatusLine row={row} />
      </div>
      {hasTrailing ? (
        <div className={ROW_TRAILING}>
          {money && row.share ? (
            <MoneyPill amount={money.amount} state={row.share.state} toggle={money.toggle} />
          ) : null}
          {hasMenu ? (
            <RosterRowMenu name={name} items={menuItems} />
          ) : reserveMenu ? (
            <span aria-hidden className={MENU_SLOT} />
          ) : null}
        </div>
      ) : null}
    </motion.li>
  );
});
