import { BellOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChatListPinIcon } from './ChatListPinIcon';

export type ChatListRowActionsProps = {
  isPinned?: boolean;
  onPinToggle?: () => void;
  canPin?: boolean;
  isPinning?: boolean;
  isMuted?: boolean;
  onMuteToggle?: () => void;
  isTogglingMute?: boolean;
};

const iconButton =
  'rounded-md p-1 transition-[opacity,colors] disabled:pointer-events-none disabled:opacity-50';

/**
 * Pin / mute next to the row time. Touch screens get quiet state icons only —
 * the actions live behind a swipe there (`ChatListSwipeRow`). Mouse screens get
 * buttons that appear on row hover and stay visible while active.
 * The row root must carry `group`.
 */
export function ChatListRowActions({
  isPinned = false,
  onPinToggle,
  canPin = true,
  isPinning = false,
  isMuted = false,
  onMuteToggle,
  isTogglingMute = false,
}: ChatListRowActionsProps) {
  const { t } = useTranslation();
  const hasButtons = onPinToggle != null || onMuteToggle != null;

  return (
    <>
      <span
        className={`flex items-center gap-1 text-gray-400 dark:text-gray-500 ${hasButtons ? 'pointer-fine:hidden' : ''}`}
        aria-hidden
      >
        {isMuted ? <BellOff className="h-3.5 w-3.5" /> : null}
        {isPinned ? <ChatListPinIcon isPinned className="h-3.5 w-3.5" /> : null}
      </span>
      {hasButtons ? (
        <span className="hidden items-center pointer-fine:flex" onClick={(e) => e.stopPropagation()}>
          {onMuteToggle != null ? (
            <button
              type="button"
              onClick={onMuteToggle}
              disabled={isTogglingMute}
              className={`${iconButton} ${
                isMuted || isTogglingMute
                  ? 'text-orange-600 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900/20'
                  : 'text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-300'
              }`}
              aria-label={isMuted ? t('chat.unmute', { defaultValue: 'Unmute chat' }) : t('chat.mute', { defaultValue: 'Mute chat' })}
              aria-busy={isTogglingMute}
            >
              {isTogglingMute ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
            </button>
          ) : null}
          {onPinToggle != null ? (
            <button
              type="button"
              onClick={onPinToggle}
              disabled={isPinned ? isPinning : !canPin || isPinning}
              className={`${iconButton} ${
                isPinned || isPinning
                  ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300'
                  : 'text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-300'
              }`}
              aria-label={isPinned ? t('chat.unpinChat') : t('chat.pinChat')}
              aria-busy={isPinning}
            >
              {isPinning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ChatListPinIcon isPinned={isPinned} />}
            </button>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
