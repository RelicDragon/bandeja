import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import { gamesApi } from '@/api/games';
import { useReactionSummary } from '@/hooks/useReactionSummary';
import type { EntityType } from '@/types';
import { getGameCardReactionTheme } from '@/utils/gameCardEntityTheme';
import { REACTION_EMOJIS } from '@/utils/messageMenuUtils';

type ReactionRow = { userId: string; emoji: string };

interface GameCardReactionsProps {
  entityType: EntityType;
  gameId: string;
  reactions: ReactionRow[];
  currentUserId: string;
  onReactionsChange: (next: ReactionRow[]) => void;
}

export function GameCardReactions({
  entityType,
  gameId,
  reactions,
  currentUserId,
  onReactionsChange,
}: GameCardReactionsProps) {
  const theme = useMemo(() => getGameCardReactionTheme(entityType), [entityType]);
  const { t } = useTranslation();
  const { getCurrentUserReaction, getReactionCounts } = useReactionSummary(reactions, currentUserId);
  const [pending, setPending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStyle, setPickerStyle] = useState<CSSProperties>({});
  const stripRef = useRef<HTMLDivElement>(null);

  const updatePickerPosition = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPickerStyle({
      bottom: window.innerHeight - r.top + 8,
      right: Math.max(8, window.innerWidth - r.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!pickerOpen) return;
    updatePickerPosition();
    window.addEventListener('resize', updatePickerPosition);
    window.addEventListener('scroll', updatePickerPosition, true);
    return () => {
      window.removeEventListener('resize', updatePickerPosition);
      window.removeEventListener('scroll', updatePickerPosition, true);
    };
  }, [pickerOpen, updatePickerPosition]);

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
    async (fn: () => Promise<{ data: { reactions: ReactionRow[] } }>) => {
      if (pending) return;
      setPending(true);
      try {
        const res = await fn();
        onReactionsChange(res.data.reactions);
      } finally {
        setPending(false);
      }
    },
    [pending, onReactionsChange]
  );

  const handleQuickReaction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cur = getCurrentUserReaction();
    if (cur === '❤️') {
      void runMutation(() => gamesApi.removeReaction(gameId));
    } else {
      void runMutation(() => gamesApi.addReaction(gameId, '❤️'));
    }
  };

  const handlePickEmoji = (emoji: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cur = getCurrentUserReaction();
    if (cur === emoji) {
      void runMutation(() => gamesApi.removeReaction(gameId));
    } else {
      void runMutation(() => gamesApi.addReaction(gameId, emoji));
    }
    setPickerOpen(false);
  };

  const counts = getReactionCounts();
  const userEmoji = getCurrentUserReaction();
  const otherReactionEntries = Object.entries(counts).filter(([emoji]) => userEmoji !== emoji);

  const pickerPortal =
    pickerOpen && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              role="presentation"
              className="fixed inset-0 z-[140] touch-none bg-black/45 dark:bg-black/55"
              onClick={() => setPickerOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('chat.reactions.addReaction')}
              className={`fixed z-[150] flex max-w-[220px] flex-wrap gap-0.5 rounded-xl p-2 shadow-2xl ${theme.panel}`}
              style={pickerStyle}
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  title={t('chat.reactions.reactWith', { emoji })}
                  onClick={handlePickEmoji(emoji)}
                  className={`rounded-full p-2 transition-colors ${theme.pickerHover} ${userEmoji === emoji ? theme.pickerSelected : ''}`}
                >
                  <span className="text-lg leading-none">{emoji}</span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <div
      ref={stripRef}
      className="absolute z-30 flex items-center gap-0.5 pointer-events-auto bottom-0 right-0 translate-x-1 translate-y-1"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {pickerPortal}

      <div className={`flex items-center gap-0 rounded-lg pl-0.5 pr-0.5 py-0 min-h-[28px] ${theme.panel}`}>
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
          <div className={`flex gap-0.5 items-center pl-0.5 border-l ${theme.divider}`}>
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
    </div>
  );
}
