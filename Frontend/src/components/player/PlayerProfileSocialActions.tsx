import { Star, MessageCircle } from 'lucide-react';
import type { TFunction } from 'i18next';

export interface PlayerProfileSocialActionsProps {
  isFavorite: boolean;
  isBlocked: boolean;
  startingChat: boolean;
  onToggleFavorite: () => void;
  onStartChat: () => void;
  t: TFunction;
}

export const PlayerProfileSocialActions = ({
  isFavorite,
  isBlocked,
  startingChat,
  onToggleFavorite,
  onStartChat,
  t,
}: PlayerProfileSocialActionsProps) => {
  const followLabel = isFavorite ? t('playerCard.unfollow') : t('playerCard.follow');
  const followTitle = isBlocked ? t('playerCard.userBlockedCannotFavorite') : followLabel;
  const messageTitle = isBlocked ? t('playerCard.userBlockedCannotChat') : t('playerCard.message');

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onStartChat}
        disabled={startingChat || isBlocked}
        className="flex-1 px-4 py-2 rounded-xl text-white flex items-center justify-center gap-2 shadow-md bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        title={messageTitle}
        aria-label={messageTitle}
      >
        <MessageCircle size={18} className="shrink-0" />
        <span className="text-sm font-medium">{t('playerCard.message')}</span>
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        disabled={isBlocked}
        className={`flex-1 px-4 py-2 rounded-xl flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
          isFavorite
            ? 'text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
            : 'text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/90'
        }`}
        title={followTitle}
        aria-label={followTitle}
      >
        <Star size={18} className={isFavorite ? 'text-white fill-white shrink-0' : 'text-amber-500 shrink-0'} />
        <span className="text-sm font-medium">{followLabel}</span>
      </button>
    </div>
  );
};
