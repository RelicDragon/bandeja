import type { ReactNode } from 'react';
import { Star, Share2, MessageCircle, Ban, Check, Maximize2 } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { UserStats } from '@/api/users';

const ICON_ACTION_CLASS =
  'h-9 w-9 shrink-0 rounded-xl inline-flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed';

const ICON_ACTION_HEADER_CLASS =
  'h-9 min-h-9 w-full min-w-0 rounded-lg inline-flex items-center justify-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed';

export interface PlayerProfileActionBarProps {
  variant?: 'default' | 'header';
  stats: UserStats;
  isCurrentUser: boolean;
  isBlocked: boolean;
  blockingUser: boolean;
  startingChat: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  onStartChat: () => void;
  onBlockPrimary: () => void;
  t: TFunction;
  closeSlot?: ReactNode;
  onOpenFullProfile?: () => void;
}

export const PlayerProfileActionBar = ({
  variant = 'default',
  stats,
  isCurrentUser,
  isBlocked,
  blockingUser,
  startingChat,
  onToggleFavorite,
  onShare,
  onStartChat,
  onBlockPrimary,
  t,
  closeSlot,
  onOpenFullProfile,
}: PlayerProfileActionBarProps) => {
  const iconClass = variant === 'header' ? ICON_ACTION_HEADER_CLASS : ICON_ACTION_CLASS;
  const headerGridCols =
    variant === 'header'
      ? !isCurrentUser
        ? (isBlocked ? 'grid-cols-3' : 'grid-cols-4')
        : 'grid-cols-1'
      : '';
  const headerMainRowClass = `grid w-full min-w-0 max-w-sm gap-1.5 items-stretch py-0.5 ${headerGridCols}`.trim();
  const wrapClass =
    variant === 'header'
      ? 'flex w-full min-w-0 max-w-full items-stretch justify-end gap-1.5 py-0.5'
      : 'flex gap-2 items-center w-full p-2 pl-6';

  const mainButtons = (
    <>
      {!isCurrentUser && (
        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={isBlocked}
          className={`${iconClass} border backdrop-blur-sm ${
            isBlocked
              ? 'opacity-50 cursor-not-allowed bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50'
              : stats.user.isFavorite
                ? 'bg-yellow-500 dark:bg-yellow-600 border-yellow-400 dark:border-yellow-500 hover:bg-yellow-600 dark:hover:bg-yellow-700'
                : 'bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-800'
          }`}
          title={isBlocked ? t('playerCard.userBlockedCannotFavorite') : (stats.user.isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites'))}
        >
          <Star size={16} className={stats.user.isFavorite ? 'text-white fill-white' : 'text-gray-400 hover:text-yellow-500 transition-colors'} />
        </button>
      )}
      {!isBlocked && (
        <button
          type="button"
          onClick={onShare}
          className={`${iconClass} text-white bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700`}
          title={t('playerCard.shareProfileTitle')}
          aria-label={t('playerCard.shareProfileTitle')}
        >
          <Share2 size={16} className="text-white" />
        </button>
      )}
      {!isCurrentUser && (
        <button
          type="button"
          onClick={() => onStartChat()}
          disabled={startingChat || isBlocked}
          className={
            variant === 'header'
              ? `${iconClass} text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed`
              : 'px-4 py-2 rounded-xl text-white flex items-center gap-2 shadow-md bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
          }
          title={t('nav.chat')}
          aria-label={t('nav.chat')}
        >
          <MessageCircle size={variant === 'header' ? 16 : 18} />
          {variant === 'default' ? <span className="text-sm">{t('nav.chat')}</span> : null}
        </button>
      )}
      {!isCurrentUser && (
        <button
          type="button"
          onClick={onBlockPrimary}
          disabled={blockingUser}
          className={`${iconClass} text-white ${
            isBlocked ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
          }`}
          title={isBlocked ? t('playerCard.unblockUser') : t('playerCard.blockUser')}
        >
          {isBlocked ? <Check size={16} className="text-white" /> : <Ban size={16} className="scale-x-[-1] text-white" />}
        </button>
      )}
    </>
  );

  const trailing = (closeSlot || (!isCurrentUser && onOpenFullProfile)) ? (
    <div className={`flex shrink-0 items-center gap-2 pl-1${variant === 'default' ? ' ml-auto' : ''}`}>
      {!isCurrentUser && onOpenFullProfile && (
        <button
          type="button"
          onClick={onOpenFullProfile}
          className={`${variant === 'header' ? 'h-9 w-9 shrink-0 rounded-lg inline-flex items-center justify-center shadow-sm' : iconClass} text-white bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 border border-violet-400/40 dark:border-violet-500/30`}
          title={t('playerCard.openFullProfile')}
          aria-label={t('playerCard.openFullProfile')}
        >
          <Maximize2 size={16} className="text-white" />
        </button>
      )}
      {closeSlot}
    </div>
  ) : null;

  if (variant === 'header' && (closeSlot || (!isCurrentUser && onOpenFullProfile))) {
    return (
      <div className={wrapClass}>
        <div className={`${headerMainRowClass} min-w-0 flex-1`}>{mainButtons}</div>
        {trailing}
      </div>
    );
  }

  if (variant === 'header') {
    return (
      <div className={wrapClass}>
        <div className={headerMainRowClass}>{mainButtons}</div>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {mainButtons}
      {trailing}
    </div>
  );
};
