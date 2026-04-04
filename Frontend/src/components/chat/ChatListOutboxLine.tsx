import { useTranslation } from 'react-i18next';
import type { ChatListOutbox } from '@/utils/chatListSort';

type Props = {
  listOutbox: ChatListOutbox;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ChatListOutboxLine({ listOutbox, onRetry, onDismiss }: Props) {
  const { t } = useTranslation();
  const label =
    listOutbox.state === 'failed'
      ? t('chat.listOutboxFailed', { defaultValue: 'Failed to send' })
      : listOutbox.state === 'sending'
        ? t('chat.listOutboxSending', { defaultValue: 'Sending…' })
        : t('chat.listOutboxQueued', { defaultValue: 'Waiting to send…' });
  const color =
    listOutbox.state === 'failed'
      ? 'text-red-600 dark:text-red-400'
      : 'text-amber-600 dark:text-amber-400';
  const kindHint =
    listOutbox.preview?.trim()
      ? null
      : listOutbox.previewKind === 'voice'
        ? t('chat.listOutboxVoice', { defaultValue: 'Voice message' })
        : listOutbox.previewKind === 'media'
          ? t('chat.listOutboxMedia', { defaultValue: 'Photo or video' })
          : null;
  const showFailedActions = listOutbox.state === 'failed' && (onRetry || onDismiss);
  return (
    <div className="mb-0.5">
      <p className={`text-xs font-medium ${color} line-clamp-2`}>
        {label}
        {listOutbox.preview?.trim() ? (
          <span className="font-normal text-gray-600 dark:text-gray-400 ml-1">· {listOutbox.preview.trim()}</span>
        ) : kindHint ? (
          <span className="font-normal text-gray-600 dark:text-gray-400 ml-1">· {kindHint}</span>
        ) : null}
      </p>
      {showFailedActions ? (
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {onRetry ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="text-xs font-semibold text-primary-600 dark:text-primary-400 py-1 px-2 rounded-md bg-primary-50 dark:bg-primary-950/50 active:opacity-80"
            >
              {t('chat.outboxRetryShort', { defaultValue: 'Retry' })}
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="text-xs font-medium text-gray-600 dark:text-gray-400 py-1 px-2 rounded-md bg-gray-100 dark:bg-gray-800 active:opacity-80"
            >
              {t('chat.outboxDismissShort', { defaultValue: 'Discard' })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
