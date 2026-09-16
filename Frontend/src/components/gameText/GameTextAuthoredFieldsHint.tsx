import { useTranslation } from 'react-i18next';

type GameTextAuthoredFieldsHintProps = {
  /** When surrounding details UI shows a translation for this game. */
  showOriginalLabel?: boolean;
  className?: string;
};

/** Helper under name/description authoring fields (create + edit). */
export function GameTextAuthoredFieldsHint({
  showOriginalLabel = false,
  className,
}: GameTextAuthoredFieldsHintProps) {
  const { t } = useTranslation();

  return (
    <div className={className ?? 'space-y-0.5'}>
      {showOriginalLabel ? (
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {t('gameDetails.gameText.originalText', { defaultValue: 'Original text' })}
        </p>
      ) : null}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t('gameDetails.gameText.autoTranslatedHelper', {
          defaultValue: 'Automatically translated for players in other languages.',
        })}
      </p>
    </div>
  );
}
