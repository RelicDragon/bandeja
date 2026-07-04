import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatDate } from '@/utils/dateFormat';
import type { EntityType, BasicUser, Sport } from '@/types';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { getDisplayLevelForSport, getUserPrimarySport } from '@/utils/profileSports';

export interface GameCancelledProps {
  entityType: EntityType;
  name?: string | null;
  cancelledAt: string;
  cancelledByUser?: BasicUser | null;
  levelSport?: Sport;
  gameId?: string;
  canViewChat?: boolean;
}

export function GameCancelled({
  name,
  cancelledAt,
  cancelledByUser,
  levelSport,
  gameId,
  canViewChat = false,
}: GameCancelledProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const resolvedSport = levelSport ?? (cancelledByUser ? getUserPrimarySport(cancelledByUser) : undefined);
  const cancellerPlayer = cancelledByUser
    ? {
        ...cancelledByUser,
        id: cancelledByUser.id,
        firstName: cancelledByUser.firstName,
        lastName: cancelledByUser.lastName,
        avatar: cancelledByUser.avatar,
        level: resolvedSport
          ? getDisplayLevelForSport(cancelledByUser, resolvedSport)
          : (cancelledByUser.level ?? 0),
        socialLevel: cancelledByUser.socialLevel ?? 0,
        gender: cancelledByUser.gender,
        approvedLevel: cancelledByUser.approvedLevel ?? false,
        isTrainer: cancelledByUser.isTrainer ?? false,
      }
    : null;

  return (
    <SportLevelProvider sport={resolvedSport}>
    <div className="flex items-center justify-center min-h-[calc(100vh-60px)] p-4">
      <Card className="text-center py-12 max-w-md">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40 shadow-inner" aria-hidden>
          <XCircle className="h-12 w-12 text-amber-500 dark:text-amber-400" />
        </div>
        <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
          {t('gameDetails.gameCancelledTitle')}
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {name
            ? t('gameDetails.gameCancelledWithName', { name })
            : t('gameDetails.gameCancelled')}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          {formatDate(cancelledAt, 'PPp')}
        </p>
        {cancellerPlayer && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <PlayerAvatar player={cancellerPlayer} extrasmall showName={false} fullHideName />
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {[cancellerPlayer.firstName, cancellerPlayer.lastName].filter(Boolean).join(' ') || '-'}
              </p>
              {cancellerPlayer.verbalStatus && (
                <p className="verbal-status">{cancellerPlayer.verbalStatus}</p>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 px-5 py-2.5 rounded-xl bg-primary-600 text-white shadow-md shadow-primary-600/25 hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-600/35 active:scale-95 transition-all duration-200 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
          {t('gameDetails.gameCancelledGoHome')}
        </button>
        {canViewChat && gameId ? (
          <button
            type="button"
            onClick={() => navigate(`/games/${gameId}/chat`)}
            className="mt-3 block w-full px-5 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 active:scale-95 transition-all duration-200"
          >
            {t('gameDetails.viewArchivedChat')}
          </button>
        ) : null}
      </Card>
    </div>
    </SportLevelProvider>
  );
}
