import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EntityType } from '@/types';

interface CommentsSectionProps {
  comments: string;
  onCommentsChange: (comments: string) => void;
  entityType: EntityType;
}

export const CommentsSection = ({ comments, onCommentsChange, entityType }: CommentsSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {entityType === 'TOURNAMENT' ? t('createGame.commentsTournament') :
           entityType === 'LEAGUE' ? t('createGame.commentsLeague') :
           t('createGame.comments')}
        </h2>
      </div>
      <textarea
        value={comments}
        onChange={(e) => onCommentsChange(e.target.value)}
        placeholder={entityType === 'TOURNAMENT' ? t('createGame.commentsPlaceholderTournament') :
                     entityType === 'LEAGUE' ? t('createGame.commentsPlaceholderLeague') :
                     t('createGame.commentsPlaceholder')}
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
        rows={3}
      />
    </div>
  );
};

