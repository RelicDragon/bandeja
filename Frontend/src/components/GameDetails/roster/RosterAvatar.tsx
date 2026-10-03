import { PlayerAvatar } from '@/components/PlayerAvatar';
import { AttendanceDot } from '@/features/attendance/AttendanceDot';
import type { AttendanceDotState } from '@/features/attendance/attendanceVisuals';
import type { BasicUser } from '@/types';

/**
 * An avatar with its attendance dot (check / ? / empty ring — shape, not only
 * colour). Nothing is drawn around the face: `PlayerAvatar` owns that layer
 * (PRD 355 equipped frames, the online border, favourite and trainer rings),
 * and a second ring there distorted frames and read like the trainer ring.
 */
export function RosterAvatar({
  user,
  attendance,
  isCurrentUser,
  role,
  size = 'sm',
  onRemove,
  onLegend,
}: {
  user: BasicUser;
  attendance: AttendanceDotState | undefined;
  isCurrentUser?: boolean;
  role?: 'OWNER' | 'ADMIN' | 'PLAYER';
  /** `sm` = 32 px list row, `lg` = 48 px face-off. */
  size?: 'sm' | 'lg';
  onRemove?: () => void;
  onLegend?: () => void;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <PlayerAvatar
        player={user}
        isCurrentUser={isCurrentUser}
        role={role}
        removable={Boolean(onRemove)}
        onRemoveClick={onRemove}
        extrasmall={size === 'sm'}
        smallLayout={size === 'lg'}
        showName={false}
        fullHideName
      />
      {attendance ? (
        <AttendanceDot state={attendance} size={size === 'lg' ? 'md' : 'sm'} onRequestLegend={onLegend} />
      ) : null}
    </span>
  );
}
