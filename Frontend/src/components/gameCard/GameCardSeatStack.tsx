import { memo, useMemo } from 'react';
import { Plus } from 'lucide-react';
import type { GameParticipant } from '@/types';
import { PlayerAvatarFace } from '@/components/PlayerAvatarFace';
import { resolveStandingPlaceVisual, type StandingMedalMode } from '@/utils/gameCardStandingPlace';
import { attendanceDotStyle } from '@/features/attendance/attendanceVisuals';
import type { AttendanceRailData } from '@/features/attendance/attendanceRailData';
import { userFaceTinySrc } from '@/utils/animatedAvatar';

interface GameCardSeatStackProps {
  participants: readonly GameParticipant[];
  /** Seats drawn as dashed circles; `null` for entities without a seat count (BAR). */
  maxParticipants: number | null;
  viewerId?: string;
  placeByUserId?: Record<string, number>;
  standingMedalMode: StandingMedalMode;
  attendanceRail: AttendanceRailData | null;
}

const SIZE = 30;
/** Seats the stack draws one by one before it summarises the rest as "+N". */
const MAX_DRAWN = 6;
const MAX_FACES_WITH_OVERFLOW = 4;

const MEDAL_BG: Record<'gold' | 'silver' | 'bronze' | 'number', string> = {
  gold: 'bg-amber-400',
  silver: 'bg-slate-400',
  bronze: 'bg-orange-500',
  number: 'bg-gray-500',
};

const RING = 'ring-2 ring-white dark:ring-gray-900';

/** Compact roster: who is in, drawn as seats — empty ones included. */
function GameCardSeatStackInner({
  participants,
  maxParticipants,
  viewerId,
  placeByUserId,
  standingMedalMode,
  attendanceRail,
}: GameCardSeatStackProps) {
  const attendanceByUserId = useMemo(() => {
    if (!attendanceRail) return null;
    return new Map(attendanceRail.players.map((p) => [p.userId, p.state]));
  }, [attendanceRail]);

  const hasSeats = maxParticipants != null && maxParticipants > 0;
  const seatsToDraw = hasSeats && maxParticipants <= MAX_DRAWN;
  // A big roster keeps a few faces and summarises the rest, leaving the
  // caption and the CTA room on a 375 pt card.
  const shownPlayers = participants.slice(
    0,
    seatsToDraw || participants.length <= MAX_DRAWN ? MAX_DRAWN : MAX_FACES_WITH_OVERFLOW,
  );
  const overflow = participants.length - shownPlayers.length;
  const emptySeats = seatsToDraw ? Math.max(0, maxParticipants - participants.length) : 0;
  const overlap = participants.length + emptySeats > 4 ? '-8px' : '-4px';

  return (
    <div className="flex shrink-0 items-center" aria-hidden>
      {shownPlayers.map((participant, index) => {
        const user = participant.user;
        const isViewer = participant.userId === viewerId;
        const place = placeByUserId?.[participant.userId];
        const placeVisual = place != null ? resolveStandingPlaceVisual(place, standingMedalMode) : null;
        const dotState = attendanceByUserId?.get(participant.userId);
        const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();
        return (
          <span
            key={participant.userId}
            className={`relative inline-block shrink-0 rounded-full ${
              isViewer ? 'ring-2 ring-primary-500' : RING
            }`}
            style={{
              width: SIZE,
              height: SIZE,
              marginInlineStart: index === 0 ? 0 : overlap,
              zIndex: MAX_DRAWN + 2 - index,
            }}
          >
            <PlayerAvatarFace
              avatar={user?.avatar}
              tinyUrl={userFaceTinySrc(user)}
              initials={initials}
              alt=""
              textClassName="text-[11px]"
              resetKey={participant.userId}
            />
            {placeVisual ? (
              <span
                className={`absolute -end-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold leading-none text-white ${RING} ${MEDAL_BG[placeVisual]}`}
              >
                {place}
              </span>
            ) : null}
            {dotState ? (
              <span
                className={`absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full ${RING} ${attendanceDotStyle(dotState).className}`}
              />
            ) : null}
          </span>
        );
      })}
      {Array.from({ length: emptySeats }, (_, index) => (
        <span
          key={`empty-${index}`}
          className="relative inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-gray-300 bg-white text-gray-300 dark:border-white/15 dark:bg-gray-900 dark:text-gray-600"
          style={{
            width: SIZE,
            height: SIZE,
            marginInlineStart: participants.length + index === 0 ? 0 : overlap,
            zIndex: 1,
          }}
        >
          <Plus size={12} strokeWidth={2.5} />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-gray-100 px-1 text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300 ${RING}`}
          style={{ minWidth: SIZE, height: SIZE, marginInlineStart: overlap }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

export const GameCardSeatStack = memo(GameCardSeatStackInner);
