import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatarFace } from '@/components/PlayerAvatarFace';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';
import type { PartnerEntry } from '@/api/pairs';
import { ChemistryChip } from './ChemistryChip';
import { memberDisplayName, pairSummaryLine, usePairFormatters } from './pairFormat';

export interface PartnerCardProps {
  partner: PartnerEntry;
  onOpen: (partner: PartnerEntry) => void;
  /** `card` is the profile rail tile; `row` is the "See all" sheet line. */
  layout?: 'card' | 'row';
}

/** One partner on Profile → Statistics: avatar, name, games, win rate, chemistry. */
export const PartnerCard = memo(({ partner, onOpen, layout = 'card' }: PartnerCardProps) => {
  const { t } = useTranslation();
  const formatters = usePairFormatters();

  const name = memberDisplayName(partner.partner);
  const gamesLabel = t('pairs.gamesCount', { count: partner.games });
  const initials =
    `${partner.partner.firstName?.[0] ?? ''}${partner.partner.lastName?.[0] ?? ''}`
      .toUpperCase()
      .trim() || '?';

  // The chip needs both members; `pairId` is the canonical `userAId,userBId`.
  const [pairA = '', pairB = ''] = partner.pairId.split(',');

  const ariaLabel = t('pairs.aria.partner', {
    name,
    games: gamesLabel,
    winRate: formatters.percentNumber(partner.winRate),
  });

  const face = (
    <span
      className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      aria-hidden
    >
      <PlayerAvatarFace
        avatar={partner.partner.avatar}
        tinyUrl={userAvatarTinyUrlFromStandard(partner.partner.avatar)}
        initials={initials}
        alt={name}
        textClassName="text-[10px]"
      />
    </span>
  );

  if (layout === 'row') {
    return (
      <div className="flex items-center gap-2" data-testid="partner-card">
        <button
          type="button"
          onClick={() => onOpen(partner)}
          aria-label={ariaLabel}
          className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-start transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60"
        >
          {face}
          <span className="flex min-w-0 flex-1 flex-col" aria-hidden>
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {name}
            </span>
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">
              {pairSummaryLine(gamesLabel, formatters.percent(partner.winRate))}
            </span>
          </span>
        </button>
        <ChemistryChip
          userAId={pairA}
          userBId={pairB}
          chemistry={partner.chemistry}
          className="shrink-0"
        />
      </div>
    );
  }

  return (
    <div className="relative" data-testid="partner-card">
      <button
        type="button"
        onClick={() => onOpen(partner)}
        aria-label={ariaLabel}
        className="flex h-28 w-32 flex-col items-center justify-center gap-1 rounded-2xl border border-gray-200 bg-white px-2 text-center transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60"
      >
        {face}
        <span
          className="w-full truncate text-xs font-semibold text-gray-900 dark:text-white"
          aria-hidden
        >
          {name}
        </span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400" aria-hidden>
          {pairSummaryLine(gamesLabel, formatters.percent(partner.winRate))}
        </span>
      </button>
      <ChemistryChip
        userAId={pairA}
        userBId={pairB}
        chemistry={partner.chemistry}
        className="absolute -top-1 end-0 scale-90"
      />
    </div>
  );
});

PartnerCard.displayName = 'PartnerCard';
