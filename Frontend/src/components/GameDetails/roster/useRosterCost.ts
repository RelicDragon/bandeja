import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { isCostSplitEnabled } from '@/config/featureFlags';
import { queryKeys } from '@/queries/queryKeys';
import { useGameCostMutations, useGameCostQuery } from '@/queries/useGameCostQuery';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { isCostLedgerHidden } from '@/features/cost/costViewModel';
import type { CostShare, CostShareMethod, GameCostSummary } from '@/api/gameCost';

/**
 * PRD 348 — the cost split, as data for the unified roster.
 *
 * No money moves here: "I paid" is a claim, "Received" is the payer's
 * acknowledgement, and the one optional coin path goes through the existing
 * in-app `TRANSFER`. There is no payment provider.
 */

const SETTLED_FLASH_MS = 600;
const UPDATED_CAPTION_MS = 5000;

export interface RosterCost {
  /** A ledger worth showing; `null` while loading, on error, or when hidden. */
  summary: GameCostSummary | null;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  retry: () => void;
  settleOpen: boolean;
  setSettleOpen: (open: boolean) => void;
  editShare: CostShare | null;
  setEditShare: (share: CostShare | null) => void;
  flashUserId: string | null;
  showUpdatedCaption: boolean;
  settle: (method: CostShareMethod) => void;
  setReceived: (share: CostShare, received: boolean) => void;
  remind: () => void;
  saveShare: (input: { userId: string; amountMinor: number; splitRemainderEvenly: boolean }) => void;
  pending: { settle: boolean; confirm: boolean; update: boolean; remind: boolean };
}

export function useRosterCost({
  gameId,
  viewerUserId,
  enabled,
  anchorRef,
  reducedMotion,
}: {
  gameId: string;
  viewerUserId: string | undefined;
  /** `canViewGameCost` — unauthorized viewers never fire the request. */
  enabled: boolean;
  /** Scrolled into view by `?section=cost`. */
  anchorRef: RefObject<HTMLElement | null>;
  reducedMotion: boolean;
}): RosterCost {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const active = enabled && isCostSplitEnabled();

  const { data, isPending, isError, isRefetching, refetch } = useGameCostQuery(gameId, active);
  const { markPaid, confirm, update, remind } = useGameCostMutations(gameId);

  const [settleOpen, setSettleOpen] = useState(false);
  const [editShare, setEditShare] = useState<CostShare | null>(null);
  const [flashUserId, setFlashUserId] = useState<string | null>(null);
  const [showUpdatedCaption, setShowUpdatedCaption] = useState(false);

  const summary = active && !isCostLedgerHidden(data) && data ? data : null;

  // A roster change before FINAL re-splits the shares. Show the quiet caption
  // only when an amount actually moved, never on the first load. The hide
  // timer lives in its own effect: a refetch with unchanged amounts inside the
  // five seconds must not cancel it and leave the caption up for good.
  const fingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (!summary) return;
    const fingerprint = summary.shares.map((share) => `${share.userId}:${share.amountMinor}`).join('|');
    const previous = fingerprintRef.current;
    fingerprintRef.current = fingerprint;
    if (previous != null && previous !== fingerprint && summary.frozenAt == null) {
      setShowUpdatedCaption(true);
    }
  }, [summary]);
  useEffect(() => {
    if (!showUpdatedCaption) return;
    const timer = window.setTimeout(() => setShowUpdatedCaption(false), UPDATED_CAPTION_MS);
    return () => window.clearTimeout(timer);
  }, [showUpdatedCaption]);

  // `game-cost-updated` fires whenever anybody's amount or paid state moved.
  const lastGameCostUpdated = useSocketEventsStore((state) => state.lastGameCostUpdated);
  useEffect(() => {
    if (!active || !lastGameCostUpdated || lastGameCostUpdated.gameId !== gameId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.gameCost.shares(gameId) });
  }, [active, gameId, lastGameCostUpdated, queryClient]);

  // Deep links: `?section=cost` scrolls the roster into view, `?settle=1` opens
  // the sheet. Both are consumed and stripped so a refresh is idempotent.
  useEffect(() => {
    if (!summary) return;
    const params = new URLSearchParams(location.search);
    const wantsSection = params.get('section') === 'cost';
    const wantsSettle = params.get('settle') === '1';
    if (!wantsSection && !wantsSettle) return;
    if (wantsSection) {
      anchorRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }
    if (wantsSettle && summary.viewerShare && summary.viewerShare.state !== 'SETTLED') {
      setSettleOpen(true);
    }
    params.delete('section');
    params.delete('settle');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }, [summary, location.pathname, location.search, navigate, reducedMotion, anchorRef]);

  const flash = useCallback((userId: string) => {
    setFlashUserId(userId);
    window.setTimeout(() => setFlashUserId(null), SETTLED_FLASH_MS);
  }, []);

  const settle = (method: CostShareMethod) => {
    markPaid.mutate(method, {
      onSuccess: () => {
        setSettleOpen(false);
        if (viewerUserId) flash(viewerUserId);
        toast.success(
          method === 'COINS'
            ? t('cost.toast.settledCoins', { coins: summary?.viewerCoinCost ?? 0 })
            : t('cost.toast.markedPaid'),
        );
      },
      onError: () => toast.error(t('cost.errors.settleFailed')),
    });
  };

  const setReceived = (share: CostShare, received: boolean) => {
    confirm.mutate(
      { userId: share.userId, confirmed: received },
      {
        onSuccess: () => {
          if (received) flash(share.userId);
          toast.success(received ? t('cost.toast.received') : t('cost.toast.receivedUndone'));
        },
        onError: () => toast.error(t('cost.errors.confirmFailed')),
      },
    );
  };

  const sendRemind = () => {
    remind.mutate(undefined, {
      onSuccess: (result) => toast.success(t('cost.toast.reminded', { count: result.sent })),
      onError: () => toast.error(t('cost.errors.remindFailed')),
    });
  };

  const saveShare = (input: { userId: string; amountMinor: number; splitRemainderEvenly: boolean }) => {
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
  };

  return {
    summary,
    isLoading: active && isPending,
    isError: active && isError,
    isRetrying: isRefetching,
    retry: () => void refetch(),
    settleOpen,
    setSettleOpen,
    editShare,
    setEditShare,
    flashUserId,
    showUpdatedCaption,
    settle,
    setReceived,
    remind: sendRemind,
    saveShare,
    pending: {
      settle: markPaid.isPending,
      confirm: confirm.isPending,
      update: update.isPending,
      remind: remind.isPending,
    },
  };
}
