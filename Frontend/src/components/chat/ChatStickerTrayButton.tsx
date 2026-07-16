import { Smile } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ChatStickerTrayButtonProps = {
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
};

export function ChatStickerTrayButton({
  disabled = false,
  active = false,
  onClick,
}: ChatStickerTrayButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="chat-sticker-tray-button"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 ${
        active
          ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
          : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
      } shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.45)]`}
      title={t('chat.stickers.openTray', { defaultValue: 'Stickers' })}
      aria-label={t('chat.stickers.openTray', { defaultValue: 'Open sticker tray' })}
      aria-pressed={active}
    >
      <Smile size={20} />
    </button>
  );
}
