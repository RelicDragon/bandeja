import type { ForwardedFromInfo } from '@/api/chat';
import { navigateToForwardedFromChat } from '@/utils/navigateToChatContext';

interface ForwardedFromHeaderProps {
  forwardedFrom: ForwardedFromInfo;
  isOwnMessage: boolean;
  className?: string;
  label: string;
}

/** Telegram-style “Forwarded from …” strip; tap opens the source chat. */
export function ForwardedFromHeader({
  forwardedFrom,
  isOwnMessage,
  className = '',
  label,
}: ForwardedFromHeaderProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateToForwardedFromChat(forwardedFrom);
      }}
      className={`mb-1 max-w-full text-left rounded-md overflow-hidden transition-opacity hover:opacity-90 active:opacity-80 ${className}`}
      aria-label={`${label} ${forwardedFrom.title}`}
    >
      <span
        className={`flex items-stretch gap-0 border-l-[3px] pl-2 py-0.5 ${
          isOwnMessage
            ? 'border-blue-200/90'
            : 'border-sky-500 dark:border-sky-400'
        }`}
      >
        <span className="min-w-0 flex flex-col">
          <span
            className={`text-[11px] font-semibold leading-tight ${
              isOwnMessage ? 'text-blue-100' : 'text-sky-600 dark:text-sky-400'
            }`}
          >
            {label}
          </span>
          <span
            className={`text-[13px] font-semibold truncate leading-snug ${
              isOwnMessage ? 'text-white' : 'text-sky-700 dark:text-sky-300'
            }`}
          >
            {forwardedFrom.title}
          </span>
        </span>
      </span>
    </button>
  );
}
