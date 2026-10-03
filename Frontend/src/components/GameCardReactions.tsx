import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Heart, MoreHorizontal } from 'lucide-react';
import { gamesApi } from '@/api/games';
import type { ReactionEmojiUsageMutationPayload } from '@/store/reactionEmojiUsageStore';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';
import { useReactionSummary } from '@/hooks/useReactionSummary';
import type { EntityType } from '@/types';
import { getGameCardReactionTheme } from '@/utils/gameCardEntityTheme';
import { EmojiQuickStrip, type ReactionEmojiPickSource } from '@/components/reactions/EmojiQuickStrip';
import { frequentReactionStripFromStore } from '@/components/reactions/reactionPickerTypes';

type ReactionRow = { userId: string; emoji: string };

interface GameCardReactionsProps {
  entityType: EntityType;
  gameId: string;
  reactions: ReactionRow[];
  currentUserId?: string;
  onReactionsChange: (next: ReactionRow[]) => void;
  className?: string;
  pickerOpens?: 'above' | 'below';
  /**
   * Quiet toolbar for the game card ticket: one neutral pill holding the
   * reaction (long-press / right-click opens the full picker, so there is no
   * separate "⋯" glyph) followed by `trailing` actions.
   */
  bare?: boolean;
  /** Extra toolbar buttons (bare mode only), drawn after a hairline divider. */
  trailing?: React.ReactNode;
}

const LONG_PRESS_MS = 450;
/** A finger that travels this far is scrolling, not pressing. */
const PRESS_SLOP_PX = 10;

export function GameCardReactions({
  entityType,
  gameId,
  reactions,
  currentUserId,
  onReactionsChange,
  className = '',
  pickerOpens = 'above',
  bare = false,
  trailing = null,
}: GameCardReactionsProps) {
  const theme = useMemo(() => getGameCardReactionTheme(entityType), [entityType]);
  const { t } = useTranslation();
  const { getCurrentUserReaction, getReactionCounts } = useReactionSummary(reactions, currentUserId);
  const [pending, setPending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const [pickerLayout, setPickerLayout] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  const updatePickerLayout = useCallback(() => {
    if (!pickerOpen || !rootRef.current) {
      setPickerLayout(null);
      return;
    }
    const r = rootRef.current.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    if (pickerOpens === 'below') {
      setPickerLayout({ top: r.bottom + 8, right });
    } else {
      setPickerLayout({ bottom: window.innerHeight - r.top + 8, right });
    }
  }, [pickerOpen, pickerOpens]);

  useLayoutEffect(() => {
    if (!pickerOpen) {
      setPickerLayout(null);
      return;
    }
    updatePickerLayout();
    window.addEventListener('resize', updatePickerLayout);
    window.addEventListener('scroll', updatePickerLayout, true);
    return () => {
      window.removeEventListener('resize', updatePickerLayout);
      window.removeEventListener('scroll', updatePickerLayout, true);
    };
  }, [pickerOpen, updatePickerLayout]);

  useEffect(() => {
    if (!pickerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pickerOpen]);

  const runMutation = useCallback(
    async (fn: () => Promise<{ data: { reactions: ReactionRow[]; emojiUsage?: { version: number; touched: unknown } } }>) => {
      if (!currentUserId || pending) return;
      setPending(true);
      try {
        const res = await fn();
        onReactionsChange(res.data.reactions);
        if (res.data.emojiUsage) {
          useReactionEmojiUsageStore.getState().applyFromMutation(res.data.emojiUsage as ReactionEmojiUsageMutationPayload);
        }
      } catch (e) {
        const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
        if (code === 'INVALID_REACTION_EMOJI') {
          toast.error(t('chat.reactions.invalidEmoji'));
          return;
        }
        console.error(e);
      } finally {
        setPending(false);
      }
    },
    [currentUserId, pending, onReactionsChange, t]
  );

  const handleQuickReaction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUserId) {
      toast.error(t('chat.reactions.loginToReact'));
      return;
    }
    const cur = getCurrentUserReaction();
    if (cur === '❤️') {
      void runMutation(() => gamesApi.removeReaction(gameId));
    } else {
      void runMutation(() => gamesApi.addReaction(gameId, '❤️'));
    }
  };

  const applyReactionEmoji = useCallback(
    (emoji: string, source: ReactionEmojiPickSource) => {
      if (!currentUserId) {
        toast.error(t('chat.reactions.loginToReact'));
        return;
      }
      const cur = getCurrentUserReaction();
      if (cur === emoji) {
        if (source === 'catalog') {
          setPickerOpen(false);
          return;
        }
        void runMutation(() => gamesApi.removeReaction(gameId));
      } else {
        void runMutation(() => gamesApi.addReaction(gameId, emoji));
      }
      setPickerOpen(false);
    },
    [currentUserId, getCurrentUserReaction, runMutation, gameId, t]
  );

  const counts = getReactionCounts();
  const userEmoji = getCurrentUserReaction();
  const frequentEmojis = useReactionEmojiUsageStore(useShallow((s) => frequentReactionStripFromStore(s)));
  const otherReactionEntries = Object.entries(counts).filter(([emoji]) => userEmoji !== emoji);
  const canReact = Boolean(currentUserId);
  const readOnlyEntries = Object.entries(counts);

  if (!canReact && readOnlyEntries.length === 0 && !(bare && trailing)) {
    return null;
  }

  const cancelLongPress = () => {
    pressOrigin.current = null;
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const stripPanel = !canReact ? (
    <div className={`flex items-center gap-0.5 rounded-lg ps-0.5 pe-0.5 py-0 min-h-[28px] ${bare ? '' : theme.panel}`}>
      {readOnlyEntries.map(([emoji, count]) => (
        <div key={emoji} className="flex flex-col items-center justify-center px-0.5 min-w-[22px]">
          <span className="text-sm leading-none">{emoji}</span>
          {count > 1 ? (
            <span className={`text-[10px] ${theme.muted} leading-none tabular-nums`}>{count}</span>
          ) : null}
        </div>
      ))}
    </div>
  ) : (
    <div className={`flex items-center gap-0 rounded-lg ps-0.5 pe-0.5 py-0 min-h-[28px] ${bare ? '' : theme.panel}`}>
      <button
        type="button"
        data-reaction-button="true"
        disabled={pending}
        onClick={handleQuickReaction}
        className={`relative flex flex-col items-center justify-center shrink-0 rounded-full min-w-[26px] min-h-[26px] px-0.5 transition-colors disabled:opacity-60 ${theme.actionHover}`}
      >
        {pending ? (
          <div className={`w-4 h-4 border-2 rounded-full animate-spin ${theme.spinner}`} />
        ) : (
          <>
            <span className="text-base leading-none block">
              {userEmoji || <span className="text-gray-600 dark:text-gray-300">♡</span>}
            </span>
            {userEmoji && counts[userEmoji] > 1 ? (
              <span className={`text-[10px] ${theme.muted} leading-none tabular-nums`}>{counts[userEmoji]}</span>
            ) : null}
          </>
        )}
      </button>

      {otherReactionEntries.length > 0 && (
        <div className={`flex gap-0.5 items-center ps-0.5 border-s ${theme.divider}`}>
          {otherReactionEntries.map(([emoji, count]) => (
            <div key={emoji} className="flex flex-col items-center justify-center px-0.5 min-w-[22px]">
              <span className="text-sm leading-none">{emoji}</span>
              {count > 1 ? (
                <span className={`text-[10px] ${theme.muted} leading-none tabular-nums`}>{count}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPickerOpen((v) => !v);
        }}
        className={`shrink-0 flex items-center justify-center min-w-[26px] min-h-[26px] rounded-full transition-colors ${theme.actionHover} ${theme.muted}`}
        title={t('chat.reactions.addReaction')}
      >
        <MoreHorizontal size={14} className="shrink-0" />
      </button>
    </div>
  );

  const pickerPortal =
    pickerOpen && pickerLayout && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              role="presentation"
              className="fixed inset-0 z-[140] touch-none bg-black/45 dark:bg-black/55"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setPickerOpen(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('chat.reactions.addReaction')}
              className="fixed z-[150] flex min-w-[220px] max-w-[min(92vw,288px)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-600 dark:bg-gray-800"
              style={{
                right: pickerLayout.right,
                ...(pickerLayout.top !== undefined ? { top: pickerLayout.top } : {}),
                ...(pickerLayout.bottom !== undefined ? { bottom: pickerLayout.bottom } : {}),
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <EmojiQuickStrip
                frequentEmojis={frequentEmojis}
                currentEmoji={userEmoji}
                onPick={applyReactionEmoji}
                disabled={pending}
              />
            </div>
          </>,
          document.body
        )
      : null;

  if (bare) {
    const chips = (entries: [string, number][]) =>
      entries.map(([emoji, count]) => (
        <span key={emoji} className="flex shrink-0 items-center gap-0.5 px-1 leading-none">
          <span className="text-[13px]">{emoji}</span>
          {count > 1 ? (
            <span className="text-[11px] font-medium tabular-nums text-gray-500 dark:text-gray-400">{count}</span>
          ) : null}
        </span>
      ));
    const heartButton = canReact ? (
      <button
        type="button"
        data-reaction-button="true"
        disabled={pending}
        aria-haspopup="dialog"
        aria-label={t('chat.reactions.addReaction')}
        title={t('chat.reactions.addReaction')}
        onClick={(e) => {
          if (longPressFired.current) {
            longPressFired.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          handleQuickReaction(e);
        }}
        onPointerDown={(e) => {
          longPressFired.current = false;
          pressOrigin.current = { x: e.clientX, y: e.clientY };
          if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
          longPressTimer.current = window.setTimeout(() => {
            longPressFired.current = true;
            setPickerOpen(true);
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          const origin = pressOrigin.current;
          if (!origin) return;
          if (Math.abs(e.clientX - origin.x) > PRESS_SLOP_PX || Math.abs(e.clientY - origin.y) > PRESS_SLOP_PX) {
            cancelLongPress();
          }
        }}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          cancelLongPress();
          setPickerOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ContextMenu' || (e.key === 'Enter' && e.shiftKey)) {
            e.preventDefault();
            setPickerOpen(true);
          }
        }}
        className="relative flex h-7 min-w-7 shrink-0 select-none items-center justify-center gap-0.5 rounded-full px-1 transition-colors hover:bg-white disabled:opacity-60 dark:hover:bg-white/10 [-webkit-touch-callout:none]"
      >
        {pending ? (
          <span className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${theme.spinner}`} />
        ) : userEmoji ? (
          <>
            <span className="text-[14px] leading-none">{userEmoji}</span>
            {counts[userEmoji] > 1 ? (
              <span className="text-[11px] font-medium tabular-nums leading-none text-gray-500 dark:text-gray-400">
                {counts[userEmoji]}
              </span>
            ) : null}
          </>
        ) : (
          <Heart size={15} className="text-gray-500 dark:text-gray-400" aria-hidden />
        )}
      </button>
    ) : null;

    return (
      <>
        {pickerPortal}
        <div
          ref={rootRef}
          className={`relative z-30 flex h-8 shrink-0 items-center rounded-full bg-gray-900/[0.04] p-0.5 pointer-events-auto dark:bg-white/[0.06] ${className}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {chips(canReact ? otherReactionEntries : readOnlyEntries)}
          {heartButton}
          {trailing ? (
            <>
              {canReact || readOnlyEntries.length > 0 ? (
                <span className="mx-0.5 h-4 w-px shrink-0 bg-gray-900/10 dark:bg-white/10" aria-hidden />
              ) : null}
              {trailing}
            </>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      {pickerPortal}
      <div
        ref={rootRef}
        className={`relative z-30 flex items-center gap-0.5 pointer-events-auto ${className}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {stripPanel}
      </div>
    </>
  );
}
