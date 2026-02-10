import { Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EntityType } from '@/types';

interface GameNameSectionProps {
  name: string;
  onNameChange: (name: string) => void;
  entityType: EntityType;
}

export const GameNameSection = ({ name, onNameChange, entityType }: GameNameSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="section-title">
          {entityType === 'TOURNAMENT' ? t('createGame.gameNameTournament') :
           entityType === 'LEAGUE' ? t('createGame.gameNameLeague') :
           entityType === 'TRAINING' ? t('createGame.gameNameTraining') :
           t('createGame.gameName')}
        </h2>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={entityType === 'TOURNAMENT' ? t('createGame.gameNamePlaceholderTournament') :
                     entityType === 'LEAGUE' ? t('createGame.gameNamePlaceholderLeague') :
                     entityType === 'TRAINING' ? t('createGame.gameNamePlaceholderTraining') :
                     t('createGame.gameNamePlaceholder')}
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
      />
    </div>
  );
};

