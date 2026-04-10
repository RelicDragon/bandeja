import { useMemo } from 'react';
import type { BasicUser } from '@/types';

export function useChatListContactSections(
  cityUsers: BasicUser[],
  followingUsers: BasicUser[],
  followersUsers: BasicUser[]
) {
  return useMemo(() => {
    const followingIds = new Set(followingUsers.map((u) => u.id));
    const followerIds = new Set(followersUsers.map((u) => u.id));
    const following = cityUsers.filter((u) => followingIds.has(u.id));
    const followers = cityUsers.filter((u) => followerIds.has(u.id) && !followingIds.has(u.id));
    const other = cityUsers.filter((u) => !followingIds.has(u.id) && !followerIds.has(u.id));
    return { following, followers, other };
  }, [cityUsers, followingUsers, followersUsers]);
}
