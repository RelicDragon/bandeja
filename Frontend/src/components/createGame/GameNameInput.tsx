import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/types';

interface GameNameInputProps {
  value: string;
  onChange: (name: string) => void;
  entityType: EntityType;
}

export const GameNameInput = ({ value, onChange, entityType }: GameNameInputProps) => {
  const { t } = useTranslation();

  const placeholder =
    entityType === 'TOURNAMENT'
      ? t('createGame.gameNamePlaceholderTournament')
      : entityType === 'LEAGUE'
        ? t('createGame.gameNamePlaceholderLeague')
        : entityType === 'TRAINING'
          ? t('createGame.gameNamePlaceholderTraining')
          : t('createGame.gameNamePlaceholder');

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
    />
  );
};
