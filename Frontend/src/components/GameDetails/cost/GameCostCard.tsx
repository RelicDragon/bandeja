import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, Lock, Pencil, Receipt } from 'lucide-react';
import { Card } from '@/components/Card';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button } from '@/components/Button';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { isCostSplitEnabled } from '@/config/featureFlags';
import { queryKeys } from '@/queries/queryKeys';
import {
  useGameCostMutations,
  useGameCostQuery,
} from '@/queries/useGameCostQuery';
import { formatCostMinor } from '@/features/cost/costMoney';
import {
  isCostLedgerHidden,
  orderCostShares,
  remindCooldownMs,
  summariseSettlement,
  viewerPrimaryAction,
} from '@/features/cost/costViewModel';
import { CostStateChip } from './CostStateChip';
import { CostSettleSheet } from './CostSettleSheet';
import { CostShareEditSheet } from './CostShareEditSheet';
import type { CostShare, CostShareMethod } from './costShareTypes';

/**
 * PRD 348 — the Cost card on a game's General tab.
 *
 * Renders **nothing at all** when the game has no splittable price, when the
 * total is zero, or when the feature flag is off — never an empty shell.
 *
 * No money moves here: "I paid" is a claim, "Received" is the payer's
 * acknowledgement, and the one optional coin path goes through the existing
 * in-app `TRANSFER`. There is no payment provider.
 */

const SETTLED_FLASH_MS = 600;
const UPDATED_CAPTION_MS = 5000;

function displayName(user: CostShare['user']): string {
  if (!user) return '';
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}

export function GameCostCard({
  gameId,
  viewerUserId,
  expectCost = true,
}: {
  gameId: string;
  viewerUserId: string | null | undefined;
  /**
   * `false` when the game's own payload already says there is no price to
   * split. The skeleton is then skipped entirely — a placeholder that always
   * resolves to nothing would just move the reflow, not remove it.
   */
  expectCost?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  const enabled = isCostSplitEnabled();
  const {
    data: summary,
    isPending,
    isError,
    isRefetching,
    refetch,
  } = useGameCostQuery(gameId, enabled);
  const { markPaid, confirm, update, remind } = useGameCostMutations(gameId);

  const [settleOpen, setSettleOpen] = useState(false);
  const [editShare, setEditShare] = useState<CostShare | null>(null);
  const [flashUserId, setFlashUserId] = useState<string | null>(null);
  const [showUpdatedCaption, setShowUpdatedCaption] = useState(false);

  const lastGameCostUpdated = useSocketEventsStore((state) => state.lastGameCostUpdated);
  const previousTotalRef = useRef<number | null>(null);

  // A roster change before FINAL re-splits the shares. Show the quiet caption
  // only when an amount actually moved, never on the first load.
  useEffect(() => {
    if (!summary || !summary.available) return;
    const previous = previousTotalRef.current;
    const fingerprint = summary.shares.reduce(
      (acc, share) => acc + share.amountMinor * share.userId.length,
      summary.shares.length,
    );
    if (previous != null && previous !== fingerprint && summary.frozenAt == null) {
      setShowUpdatedCaption(true);
      const timer = window.setTimeout(() => setShowUpdatedCaption(false), UPDATED_CAPTION_MS);
      previousTotalRef.current = fingerprint;
      return () => window.clearTimeout(timer);
    }
    previousTotalRef.current = fingerprint;
  }, [summary]);

  // `game-cost-updated` fires whenever anybody's amount or paid state moved —
  // a roster change, another player's "I paid", the organizer's override.
  useEffect(() => {
    if (!lastGameCostUpdated || lastGameCostUpdated.gameId !== gameId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.gameCost.shares(gameId) });
  }, [gameId, lastGameCostUpdated, queryClient]);

  const shares = useMemo(
    () => orderCostShares(
      summary?.canManage || summary?.canConfirm
        ? summary.shares
        : (summary?.shares ?? []).filter((share) => share.userId === viewerUserId),
      viewerUserId,
    ),
    [summary, viewerUserId],
  );

  // Deep links: `?section=cost` scrolls the card into view, `?settle=1` opens
  // the sheet. Both are consumed and stripped so a refresh is idempotent.
  useEffect(() => {
    if (!summary || !summary.available) return;
    const params = new URLSearchParams(location.search);
    const wantsSection = params.get('section') === 'cost';
    const wantsSettle = params.get('settle') === '1';
    if (!wantsSection && !wantsSettle) return;

    if (wantsSection) {
      cardRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }
    if (wantsSettle && summary.viewerShare && summary.viewerShare.state !== 'SETTLED') {
      setSettleOpen(true);
    }

    params.delete('section');
    params.delete('settle');
    const next = params.toString();
    navigate({ pathname: location.pathname, search: next }, { replace: true });
  }, [summary, location.pathname, location.search, navigate, reducedMotion]);

  const flash = useCallback((userId: string) => {
    setFlashUserId(userId);
    window.setTimeout(() => setFlashUserId(null), SETTLED_FLASH_MS);
  }, []);

  // Three different answers, three different treatments. Folding them into one
  // `return null` made a failed fetch look exactly like "this game has no cost
  // split", and made the card pop in mid-scroll on a cold open (CONTRACT §13).
  if (!enabled) return null;

  if (isPending) {
    if (!expectCost) return null;
    return (
      <div ref={cardRef} data-cost-card="" data-cost-state="loading">
        <Card className="p-4" aria-busy>
          <span className="sr-only">{t('cost.loading')}</span>
          <div className="mb-3 flex items-center gap-2" aria-hidden>
            <div className={`${shimmerBlock} h-5 w-5 rounded-full`} />
            <div className={`${shimmerBlock} h-5 w-32`} />
          </div>
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((row) => (
              <div key={row} className={`${shimmerBlock} h-11 w-full rounded-xl`} />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (isError) {
    // Same reasoning as the skeleton: do not announce a failure to load a
    // ledger this game was never going to have.
    if (!expectCost) return null;
    return (
      <div ref={cardRef} data-cost-card="" data-cost-state="error">
        <Card className="p-4">
          <div className="flex min-w-0 items-start gap-2">
            <Receipt size={18} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('cost.title')}
              </h3>
              <p role="alert" className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                {t('cost.loadFailed')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={isRefetching}
                onClick={() => void refetch()}
              >
                {t('common.retry')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Genuinely nothing to show: no splittable price, a zero total, or a ledger
  // the viewer is not part of. This is the only case that stays silent.
  if (isCostLedgerHidden(summary) || !summary || !summary.currency) {
    return null;
  }

  const currency = summary.currency;
  const settlement = summariseSettlement(summary);
  const cooldownMs = remindCooldownMs(summary.remindAvailableAt);
  const frozen = summary.frozenAt != null;
  const primaryAction = viewerPrimaryAction(summary, viewerUserId);

  const money = (minor: number) => formatCostMinor(minor, currency, i18n.language);

  /** Computed once so every row in the card keeps the same height. */
  const stackRowMeta = summary.canConfirm || (summary.canManage && !frozen);

  const handleSettle = (method: CostShareMethod) => {
    markPaid.mutate(method, {
      onSuccess: () => {
        setSettleOpen(false);
        if (viewerUserId) flash(viewerUserId);
        toast.success(
          method === 'COINS'
            ? t('cost.toast.settledCoins', { coins: summary.viewerCoinCost ?? 0 })
            : t('cost.toast.markedPaid'),
        );
      },
      onError: () => toast.error(t('cost.errors.settleFailed')),
    });
  };

  const handleConfirm = (share: CostShare, confirmed: boolean) => {
    confirm.mutate(
      { userId: share.userId, confirmed },
      {
        onSuccess: () => {
          if (confirmed) flash(share.userId);
          toast.success(confirmed ? t('cost.toast.received') : t('cost.toast.receivedUndone'));
        },
        onError: () => toast.error(t('cost.errors.confirmFailed')),
      },
    );
  };

  const handleRemind = () => {
    remind.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(t('cost.toast.reminded', { count: result.sent }));
      },
      onError: () => toast.error(t('cost.errors.remindFailed')),
    });
  };

  return (
    <div ref={cardRef} data-cost-card="">
      <Card className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Receipt size={18} className="shrink-0 text-gray-400" aria-hidden />
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                {t('cost.title')}
              </h3>
              {(summary.canManage || summary.canConfirm) && summary.totalMinor != null ? (
                <p className="truncate text-sm text-gray-600 dark:text-gray-400">
                  {t('cost.totalLine', { amount: money(summary.totalMinor) })}
                </p>
              ) : (
                <p className="truncate text-sm text-gray-600 dark:text-gray-400">
                  {t('cost.summaryAllSettled', { settled: settlement.settled, total: settlement.total })}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {frozen ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                title={t('cost.frozen')}
              >
                <Lock size={12} aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('cost.frozen')}</span>
              </span>
            ) : null}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showUpdatedCaption ? (
            <motion.p
              key="updated"
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              role="status"
              className="mb-2 text-xs text-gray-500 dark:text-gray-400"
            >
              {t('cost.updatedCaption')}
            </motion.p>
          ) : null}
        </AnimatePresence>

        {/*
          At 375 px the card's inner width is ≈319 px. A single row of
          avatar + name + amount + state chip + a 44 px checkbox + a 44 px
          pencil leaves the organizer — the only role that sees both controls —
          two or three characters of name, in the exact moment they have to tell
          whose share they are marking. So when either control is present the
          amount and the chip move onto their own line and the name gets the
          full width (CONTRACT §7.1, mobile first).
        */}
        <ul className="space-y-1">
          {shares.map((share) => {
            const isViewer = share.userId === viewerUserId;
            const name = displayName(share.user) || t('common.unknown');
            const flashing = flashUserId === share.userId && !reducedMotion;
            return (
              <li
                key={share.userId}
                className={`flex min-h-[44px] items-center gap-2 rounded-xl px-2 py-1 transition-colors duration-300 ${
                  flashing ? 'bg-green-50 dark:bg-green-500/10' : ''
                } ${isViewer ? 'bg-gray-50 dark:bg-gray-800/60' : ''}`}
              >
                <PlayerAvatar player={share.user} superTiny fullHideName />
                <span
                  className={`flex min-w-0 flex-1 gap-x-2 ${
                    stackRowMeta ? 'flex-col items-start' : 'items-center justify-between'
                  }`}
                >
                  <span className="min-w-0 max-w-full truncate text-sm text-gray-900 dark:text-white">
                    {name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                      {money(share.amountMinor)}
                    </span>
                    <CostStateChip state={share.state} />
                  </span>
                </span>

                {summary.canConfirm && !share.isPayer ? (
                  <label className="inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700"
                      checked={share.state === 'SETTLED'}
                      disabled={confirm.isPending || share.method === 'COINS'}
                      onChange={(event) => handleConfirm(share, event.target.checked)}
                    />
                    <span className="sr-only">{t('cost.receivedFor', { name })}</span>
                  </label>
                ) : null}

                {summary.canManage && !frozen ? (
                  <button
                    type="button"
                    onClick={() => setEditShare(share)}
                    aria-label={t('cost.editShareFor', { name })}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {primaryAction !== 'NONE' ? (
          <Button
            className="mt-3 w-full"
            variant={primaryAction === 'SETTLED' ? 'secondary' : 'primary'}
            disabled={primaryAction === 'SETTLED' || markPaid.isPending}
            onClick={() => setSettleOpen(true)}
          >
            {primaryAction === 'SETTLED' ? t('cost.settledButton') : t('cost.iPaid')}
          </Button>
        ) : null}

        {summary.canConfirm ? (
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {settlement.allSettled || settlement.outstandingMinor == null
                ? t('cost.summaryAllSettled', {
                    settled: settlement.settled,
                    total: settlement.total,
                  })
                : t('cost.summaryStrip', {
                    settled: settlement.settled,
                    total: settlement.total,
                    amount: money(settlement.outstandingMinor),
                  })}
            </p>
            {!settlement.allSettled ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 inline-flex items-center gap-2"
                  disabled={cooldownMs > 0 || remind.isPending || !summary.canRemind}
                  onClick={handleRemind}
                >
                  <BellRing size={14} aria-hidden />
                  {t('cost.remindUnpaid')}
                </Button>
                {cooldownMs > 0 ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('cost.remindCooldown', {
                      hours: Math.max(1, Math.ceil(cooldownMs / 3_600_000)),
                    })}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </Card>

      <CostSettleSheet
        open={settleOpen}
        onOpenChange={setSettleOpen}
        summary={summary}
        pending={markPaid.isPending}
        onSettle={handleSettle}
      />

      {summary.canManage && summary.totalMinor != null ? (
        <CostShareEditSheet
          open={editShare != null}
          onOpenChange={(next) => {
            if (!next) setEditShare(null);
          }}
          share={editShare}
          currency={currency}
          totalMinor={summary.totalMinor}
          pending={update.isPending}
          onSave={(input) => {
            update.mutate(
              {
                overrides: [{ userId: input.userId, amountMinor: input.amountMinor }],
                splitRemainderEvenly: input.splitRemainderEvenly,
              },
              {
                onSuccess: () => {
                  setEditShare(null);
                  toast.success(t('cost.toast.shareUpdated'));
                },
                onError: () => toast.error(t('cost.errors.updateFailed')),
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
