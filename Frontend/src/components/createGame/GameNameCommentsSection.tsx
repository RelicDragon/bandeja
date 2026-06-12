import { Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EntityType } from '@/types';

interface GameNameCommentsSectionProps {
  name: string;
  comments: string;
  onNameChange: (name: string) => void;
  onCommentsChange: (comments: string) => void;
  entityType: EntityType;
}

export const GameNameCommentsSection = ({
  name,
  comments,
  onNameChange,
  onCommentsChange,
  entityType,
}: GameNameCommentsSectionProps) => {
  const { t } = useTranslation();

  const title =
    entityType === 'TOURNAMENT'
      ? t('createGame.gameNameTournament')
      : entityType === 'LEAGUE'
        ? t('createGame.gameNameLeague')
        : entityType === 'TRAINING'
          ? t('createGame.gameNameTraining')
          : t('createGame.gameName');

  const namePlaceholder =
    entityType === 'TOURNAMENT'
      ? t('createGame.gameNamePlaceholderTournament')
      : entityType === 'LEAGUE'
        ? t('createGame.gameNamePlaceholderLeague')
        : entityType === 'TRAINING'
          ? t('createGame.gameNamePlaceholderTraining')
          : t('createGame.gameNamePlaceholder');

  const descriptionLabel = t('createGame.description');
  const descriptionPlaceholder =
    entityType === 'TOURNAMENT'
      ? t('createGame.descriptionPlaceholderTournament')
      : entityType === 'LEAGUE'
        ? t('createGame.descriptionPlaceholderLeague')
        : entityType === 'TRAINING'
          ? t('createGame.descriptionPlaceholderTraining')
          : t('createGame.descriptionPlaceholder');

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={namePlaceholder}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            {descriptionLabel}
          </label>
          <textarea
            value={comments}
            onChange={(e) => onCommentsChange(e.target.value)}
            placeholder={descriptionPlaceholder}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
            rows={3}
          />
        </div>
      </div>
    </div>
  );
};
