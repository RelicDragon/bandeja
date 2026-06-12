import {
  memo,
  useCallback,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Heart, MessageCircle, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { lightHaptic } from '@/utils/lightHaptic';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { recordStoryDmReactionUse } from './storyDmQuickReactions';
import { formatStoryEngagementCount } from './storyEngagementFormat';
import { STORY_VIEWER_ICON_BTN, storyViewerCommentIconClass } from '../storyViewerIconBtn';
import { StoryViewerQuickReactions } from './StoryViewerQuickReactions';

function barButtonPointerDown(e: PointerEvent<HTMLButtonElement>) {
  e.stopPropagation();
  if (e.button !== 0) return;
  if (e.pointerType === 'mouse' || e.pointerType === 'pen') e.preventDefault();
}

function blurAfterClick(el: HTMLButtonElement) {
  requestAnimationFrame(() => requestAnimationFrame(() => el.blur()));
}

const DM_INPUT_CLASS = [
  'min-w-0 flex-1 rounded-full border border-white/40 bg-black/35 px-4 py-2.5',
  'text-sm text-white placeholder:text-white/55',
  'backdrop-blur-md outline-none',
  'focus:border-white/60 focus:bg-black/45',
].join(' ');

type StoryViewerBottomBarProps = {
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
  viewerHasCommented: boolean;
  onToggleLike: () => void;
  onOpenLikers?: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  onSendDm: (text: string) => Promise<boolean>;
  dmFocused: boolean;
  onDmFocusedChange: (focused: boolean) => void;
  onDmSent?: (payload: string) => void;
  captionAbove?: ReactNode;
};

export const StoryViewerBottomBar = memo(function StoryViewerBottomBar({
  likeCount,
  commentCount,
  viewerHasLiked,
  viewerHasCommented,
  onToggleLike,
  onOpenLikers,
  onOpenComments,
  onShare,
  onSendDm,
  dmFocused,
  onDmFocusedChange,
  onDmSent,
  captionAbove,
}: StoryViewerBottomBarProps) {
  const { t } = useTranslation();
  const [dmText, setDmText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useKeyboardInset();

  const blurDm = useCallback(() => {
    inputRef.current?.blur();
    onDmFocusedChange(false);
  }, [onDmFocusedChange]);

  const handleDmBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      const related = e.relatedTarget as Node | null;
      if (related && barRef.current?.contains(related)) return;
      onDmFocusedChange(false);
    },
    [onDmFocusedChange]
  );

  const submitDm = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      lightHaptic();
      const ok = await onSendDm(trimmed);
      if (!ok) return;
      setDmText('');
      onDmSent?.(trimmed);
      blurDm();
    },
    [blurDm, onDmSent, onSendDm]
  );

  const handleDmKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void submitDm(dmText);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        blurDm();
      }
    },
    [blurDm, dmText, submitDm]
  );

  const handleQuickReaction = useCallback(
    (emoji: string) => {
      lightHaptic();
      void (async () => {
        recordStoryDmReactionUse(emoji);
        const ok = await onSendDm(emoji);
        if (!ok) return;
        onDmSent?.(emoji);
        setDmText('');
        blurDm();
      })();
    },
    [blurDm, onDmSent, onSendDm]
  );

  const bottomPad = dmFocused
    ? `max(0.5rem, ${keyboardInset.insetPx}px)`
    : 'max(0.5rem, env(safe-area-inset-bottom, 0px))';

  return (
    <>
      {dmFocused ? (
        <button
          type="button"
          aria-label={t('common.close')}
          className="pointer-events-auto absolute inset-0 z-[35] bg-black/20"
          onClick={blurDm}
        />
      ) : null}

      <StoryViewerQuickReactions visible={dmFocused} onPick={handleQuickReaction} />

      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/75 via-black/25 to-transparent backdrop-blur-md"
        style={{ paddingBottom: bottomPad }}
        data-story-interactive
      >
        {captionAbove ? <div className="px-3 pb-1.5 pt-2">{captionAbove}</div> : null}
        <div ref={barRef} className="flex items-center gap-2 px-3 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={dmText}
            maxLength={500}
            placeholder={t('stories.viewer.dmPlaceholder')}
            onFocus={() => onDmFocusedChange(true)}
            onBlur={handleDmBlur}
            onChange={(e) => setDmText(e.target.value)}
            onKeyDown={handleDmKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.stopPropagation();
              runWithProfileName(() => inputRef.current?.focus());
            }}
            className={DM_INPUT_CLASS}
            enterKeyHint="send"
          />

          {!dmFocused ? (
            <>
              <button
                type="button"
                aria-label={t('stories.viewer.likeCount', { count: likeCount })}
                className={STORY_VIEWER_ICON_BTN}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLike();
                  blurAfterClick(e.currentTarget);
                }}
                onPointerDown={barButtonPointerDown}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <Heart
                  size={28}
                  className={viewerHasLiked ? 'fill-red-500 text-red-500' : 'text-white'}
                  strokeWidth={viewerHasLiked ? 0 : 1.75}
                />
                {likeCount > 0 && onOpenLikers ? (
                  <span className="sr-only">{formatStoryEngagementCount(likeCount)}</span>
                ) : null}
              </button>

              <button
                type="button"
                aria-label={t('stories.viewer.commentCount', { count: commentCount })}
                className={STORY_VIEWER_ICON_BTN}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenComments();
                  blurAfterClick(e.currentTarget);
                }}
                onPointerDown={barButtonPointerDown}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <MessageCircle
                  size={28}
                  className={storyViewerCommentIconClass(viewerHasCommented)}
                  strokeWidth={viewerHasCommented ? 0 : 1.75}
                />
              </button>

              <button
                type="button"
                aria-label={t('stories.viewer.share')}
                className={STORY_VIEWER_ICON_BTN}
                onClick={(e) => {
                  e.stopPropagation();
                  onShare();
                  blurAfterClick(e.currentTarget);
                }}
                onPointerDown={barButtonPointerDown}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <Send size={26} className="text-white -rotate-12" strokeWidth={1.75} />
              </button>
            </>
          ) : dmText.trim() ? (
            <button
              type="button"
              aria-label={t('stories.viewer.sendDm')}
              className={`${STORY_VIEWER_ICON_BTN} bg-sky-500/90`}
              onClick={(e) => {
                e.stopPropagation();
                void submitDm(dmText);
                blurAfterClick(e.currentTarget);
              }}
              onPointerDown={(e) => {
                barButtonPointerDown(e);
                e.preventDefault();
              }}
            >
              <Send size={22} className="text-white" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
});
