import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { blockedUsersApi } from '@/api/blockedUsers';
import { useAuthStore } from '@/store/authStore';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { PlayerAvatar } from './PlayerAvatar';
import { Card } from './Card';
import { Loading } from './Loading';
import { formatDate } from '@/utils/dateFormat';
import toast from 'react-hot-toast';
import { Ban } from 'lucide-react';
import { BasicUser } from '@/types';

interface BlockedUser {
  id: string;
  userId: string;
  blockedUserId: string;
  createdAt: string;
  blockedUser: BasicUser;
}

export const BlockedUsersSection = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { openPlayerCard } = usePlayerCardModal();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchBlockedUsers = async () => {
      if (!user?.blockedUserIds || user.blockedUserIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await blockedUsersApi.getBlockedUsers();
        setBlockedUsers(response.data || []);
      } catch (error) {
        console.error('Failed to fetch blocked users:', error);
        toast.error(t('errors.generic') || 'Failed to load blocked users');
      } finally {
        setLoading(false);
      }
    };

    fetchBlockedUsers();
  }, [user?.blockedUserIds, t]);

  if (!user?.blockedUserIds || user.blockedUserIds.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          {t('profile.blockedUsers') || 'Blocked Users'}
        </h2>
        <div className="flex justify-center items-center h-32">
          <Loading />
        </div>
      </Card>
    );
  }

  if (blockedUsers.length === 0) {
    return null;
  }

  return (
    <Card>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Ban size={20} className="text-red-500" />
        {t('profile.blockedUsers') || 'Blocked Users'}
      </h2>
      <div className="space-y-3">
        {blockedUsers.map((blockedUser) => (
          <div
            key={blockedUser.id}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openPlayerCard(blockedUser.blockedUser.id);
            }}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
          >
            <div className="flex-shrink-0">
              <PlayerAvatar
                player={blockedUser.blockedUser}
                showName={false}
                fullHideName={true}
                smallLayout={false}
                extrasmall={true}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="font-medium text-gray-900 dark:text-white truncate">
                {blockedUser.blockedUser.firstName} {blockedUser.blockedUser.lastName}
              </div>
              {blockedUser.blockedUser.verbalStatus && (
                <p className="verbal-status">
                  {blockedUser.blockedUser.verbalStatus}
                </p>
              )}
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {t('profile.blockedOn') || 'Blocked on'} {formatDate(blockedUser.createdAt, 'PPP')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

