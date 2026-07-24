import type { ForwardedFromInfo } from '@/api/chat';
import { navigateToForwardedFromChat } from '@/utils/navigateToChatContext';

interface ForwardedFromHeaderProps {
  forwardedFrom: ForwardedFromInfo;
  className?: string;
  label: string;
}

/** Telegram-style “Forwarded from …” strip; tap opens the source chat. */
export function ForwardedFromHeader({
  forwardedFrom,
  className = '',
  label,
}: ForwardedFromHeaderProps) {
  return (
    <button
      type="button"
      data-forwarded-from-header="true"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateToForwardedFromChat(forwardedFrom);
      }}
      className={`relative z-20 mb-1 max-w-full text-left rounded-md overflow-hidden cursor-pointer transition-colors hover:bg-sky-50/80 dark:hover:bg-sky-950/40 active:bg-sky-100/80 dark:active:bg-sky-900/40 ${className}`}
      aria-label={`${label} ${forwardedFrom.title}`}
    >
      <span className="flex items-stretch gap-0 border-l-[3px] border-sky-500 dark:border-sky-400 pl-2 py-0.5">
        <span className="min-w-0 flex flex-col">
          <span className="text-[11px] font-semibold leading-tight text-sky-600 dark:text-sky-400">
            {label}
          </span>
          <span className="text-[13px] font-semibold truncate leading-snug text-sky-800 dark:text-sky-200">
            {forwardedFrom.title}
          </span>
        </span>
      </span>
    </button>
  );
}
