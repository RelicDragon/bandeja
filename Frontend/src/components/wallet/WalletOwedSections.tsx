import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useOwedSharesQuery } from '@/queries/useGameCostQuery';
import { formatCostMinor } from '@/features/cost/costMoney';
import type { OwedCostShare } from '@/api/gameCost';
import { isCostSplitEnabled } from '@/config/featureFlags';
import { resolveIntlLocale } from '@/utils/intlLocale';

/**
 * PRD 348 — the Wallet's **Owed** and **Owed to you** lists.
 *
 * Every row deep-links back to the game's Cost card with the settle sheet
 * pre-opened (`?section=cost&settle=1`), so the Wallet never duplicates the
 * settle logic. Renders nothing when the flag is off or when there is nothing
 * outstanding in either direction.
 */

function counterpartyName(share: OwedCostShare): string {
  if (!share.counterparty) return '';
  return `${share.counterparty.firstName ?? ''} ${share.counterparty.lastName ?? ''}`.trim();
}

function OwedRow({
  share,
  locale,
  actionLabel,
  onAction,
  subtitle,
}: {
  share: OwedCostShare;
  locale: string;
  actionLabel: string | null;
  onAction?: () => void;
  subtitle: string;
}) {
  // `resolveIntlLocale` so the short month name follows the UI's script (`sr`
  // is Serbian Latin here, which a bare `sr` would render in Cyrillic).
  const dateLabel = share.startTime
    ? new Intl.DateTimeFormat(resolveIntlLocale(locale), {
        day: 'numeric',
        month: 'short',
      }).format(new Date(share.startTime))
    : null;

  return (
    <li className="flex min-h-[44px] items-center gap-3 rounded-xl border border-gray-200 p-2 dark:border-gray-800">
      <PlayerAvatar player={share.counterparty} superTiny fullHideName />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
          {share.gameName || subtitle}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {[dateLabel, subtitle].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
        {formatCostMinor(share.amountMinor, share.currency, locale)}
      </span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
        >
          {actionLabel}
        </button>
      ) : null}
    </li>
  );
}

export function WalletOwedSections({ onNavigate }: { onNavigate?: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const enabled = isCostSplitEnabled();
  const { data } = useOwedSharesQuery(enabled);

  if (!enabled || !data) return null;

  const hasAny = data.owed.length > 0 || data.owedToMe.length > 0;

  const goSettle = (gameId: string) => {
    onNavigate?.();
    navigate(`/games/${gameId}?section=cost&settle=1`);
  };

  const goCard = (gameId: string) => {
    onNavigate?.();
    navigate(`/games/${gameId}?section=cost`);
  };

  if (!hasAny) {
    return (
      <div className="mb-4">
        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
          {t('cost.wallet.owed')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('cost.wallet.allSettled')}</p>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-4">
      {data.owed.length > 0 ? (
        <section>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            {t('cost.wallet.owed')}
          </h3>
          <ul className="space-y-2">
            {data.owed.map((share) => (
              <OwedRow
                key={`${share.gameId}-owed`}
                share={share}
                locale={i18n.language}
                subtitle={t('cost.wallet.toName', { name: counterpartyName(share) })}
                actionLabel={t('cost.wallet.settle')}
                onAction={() => goSettle(share.gameId)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {data.owedToMe.length > 0 ? (
        <section>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            {t('cost.wallet.owedToYou')}
          </h3>
          <ul className="space-y-2">
            {data.owedToMe.map((share) => (
              <OwedRow
                key={`${share.gameId}-${share.counterpartyUserId ?? 'x'}-owedToMe`}
                share={share}
                locale={i18n.language}
                subtitle={t('cost.wallet.fromName', { name: counterpartyName(share) })}
                actionLabel={t('cost.wallet.view')}
                onAction={() => goCard(share.gameId)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
