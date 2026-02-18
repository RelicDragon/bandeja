import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { favoritesApi } from '@/api/favorites';
import { PlayerAvatar, Card, Loading } from '@/components';
import { useAuthStore } from '@/store/authStore';
import type { BasicUser } from '@/types';

const UserRow = ({ user, isCurrentUser }: { user: BasicUser; isCurrentUser: boolean }) => (
  <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
    <PlayerAvatar
      player={user}
      isCurrentUser={isCurrentUser}
      extrasmall
      showName={false}
      fullHideName
    />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
        {user.firstName} {user.lastName}
      </p>
      {user.verbalStatus && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
          {user.verbalStatus}
        </p>
      )}
    </div>
  </div>
);

export const ProfileFollowers = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [following, setFollowing] = useState<BasicUser[]>([]);
  const [followers, setFollowers] = useState<BasicUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [followingRes, followersRes] = await Promise.all([
          favoritesApi.getFollowing(),
          favoritesApi.getFollowers(),
        ]);
        setFollowing(followingRes);
        setFollowers(followersRes);
      } catch (e) {
        console.error('Failed to load followers/following:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          {t('profile.following')}
        </h2>
        <div className="space-y-1">
          {following.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
              {t('profile.noFollowing') || 'Not following anyone yet'}
            </p>
          ) : (
            following.map((u) => (
              <UserRow key={u.id} user={u} isCurrentUser={u.id === user?.id} />
            ))
          )}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          {t('profile.followers')}
        </h2>
        <div className="space-y-1">
          {followers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
              {t('profile.noFollowers') || 'No followers yet'}
            </p>
          ) : (
            followers.map((u) => (
              <UserRow key={u.id} user={u} isCurrentUser={u.id === user?.id} />
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
