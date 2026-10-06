import type { ClubAdminPersonRef } from '@shared/clubAdmin/contract';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { BasicUser } from '@/types';

/** A console person ref as a small avatar face (PlayerAvatar owns rings and fallbacks). */
export function PersonFace({ person, size = 'md' }: { person: ClubAdminPersonRef; size?: 'sm' | 'md' }) {
  return (
    <PlayerAvatar
      player={
        {
          id: person.id,
          firstName: person.firstName ?? undefined,
          lastName: person.lastName ?? undefined,
          avatar: person.avatar,
          level: 0,
          socialLevel: 0,
        } as BasicUser
      }
      inlineFace
      inlineFaceSize={size}
      subscribePresence={false}
    />
  );
}
