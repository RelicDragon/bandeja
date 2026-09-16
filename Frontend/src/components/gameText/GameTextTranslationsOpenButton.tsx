import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type GameTextTranslationsOpenButtonProps = {
  onClick: () => void;
  className?: string;
};

/** Secondary action on text editors — opens organizer translations panel. */
export function GameTextTranslationsOpenButton({
  onClick,
  className = '',
}: GameTextTranslationsOpenButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 ${className}`}
    >
      <Languages size={14} aria-hidden />
      {t('gameDetails.gameText.editor.open')}
    </button>
  );
}
