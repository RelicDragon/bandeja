import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatDate } from '@/utils/dateFormat';
import type { EntityType, BasicUser } from '@/types';

export interface GameCancelledProps {
  entityType: EntityType;
  name?: string | null;
  cancelledAt: string;
  cancelledByUser?: BasicUser | null;
}

export function GameCancelled({ name, cancelledAt, cancelledByUser }: GameCancelledProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const cancellerPlayer = cancelledByUser
    ? {
        ...cancelledByUser,
        id: cancelledByUser.id,
        firstName: cancelledByUser.firstName,
        lastName: cancelledByUser.lastName,
        avatar: cancelledByUser.avatar,
        level: cancelledByUser.level ?? 0,
        socialLevel: cancelledByUser.socialLevel ?? 0,
        gender: cancelledByUser.gender,
        approvedLevel: cancelledByUser.approvedLevel ?? false,
        isTrainer: cancelledByUser.isTrainer ?? false,
      }
    : null;

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-60px)] p-4">
      <Card className="text-center py-12 max-w-md">
        <XCircle className="mx-auto h-14 w-14 text-amber-500 dark:text-amber-400" aria-hidden />
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
          className="mt-6 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
          {t('gameDetails.gameCancelledGoHome')}
        </button>
      </Card>
    </div>
  );
}
