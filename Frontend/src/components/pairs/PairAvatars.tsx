import { memo } from 'react';
import { PlayerAvatarFace } from '@/components/PlayerAvatarFace';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';
import type { PairMember } from '@/api/pairs';
import { memberDisplayName } from './pairFormat';

export type PairAvatarsRing = 'none' | 'gold' | 'silver' | 'bronze';

export interface PairAvatarsProps {
  userA: PairMember;
  userB: PairMember;
  /** Face diameter in px. The two faces overlap by exactly `overlap`. */
  size?: number;
  overlap?: number;
  ring?: PairAvatarsRing;
  className?: string;
}

const RING_CLASS: Record<PairAvatarsRing, string> = {
  none: 'ring-1 ring-white dark:ring-gray-900',
  // Thin metallic rings for the podium. Kept as explicit colours rather than a
  // token because gold/silver/bronze are the same in every theme.
  gold: 'ring-2 ring-[#e0b544] dark:ring-[#f0c860]',
  silver: 'ring-2 ring-[#a9b2bd] dark:ring-[#c3ccd6]',
  bronze: 'ring-2 ring-[#b57a4a] dark:ring-[#cd8f5c]',
};

function initialsOf(member: PairMember): string {
  const first = member.firstName?.trim()?.[0] ?? '';
  const last = member.lastName?.trim()?.[0] ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

/**
 * Two faces overlapping along the inline axis.
 *
 * The offset is a negative **inline-start** margin, so in `ar` the stack
 * mirrors and the second face still sits on the reading-direction end instead
 * of jumping to the wrong side.
 */
export const PairAvatars = memo(
  ({ userA, userB, size = 36, overlap = 12, ring = 'none', className = '' }: PairAvatarsProps) => {
    const faceStyle = { width: size, height: size };
    const ringClass = RING_CLASS[ring];

    return (
      <span
        className={`inline-flex shrink-0 items-center ${className}`.trim()}
        aria-hidden
        data-testid="pair-avatars"
      >
        {[userA, userB].map((member, index) => (
          <span
            key={member.id}
            className={`relative block shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${ringClass}`}
            style={{
              ...faceStyle,
              marginInlineStart: index === 0 ? 0 : -overlap,
              zIndex: index === 0 ? 2 : 1,
            }}
          >
            <PlayerAvatarFace
              avatar={member.avatar}
              tinyUrl={userAvatarTinyUrlFromStandard(member.avatar)}
              initials={initialsOf(member)}
              alt={memberDisplayName(member)}
              textClassName={size >= 44 ? 'text-sm' : 'text-[10px]'}
            />
          </span>
        ))}
      </span>
    );
  },
);

PairAvatars.displayName = 'PairAvatars';
