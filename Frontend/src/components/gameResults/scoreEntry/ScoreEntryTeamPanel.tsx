import { PlayerAvatar } from '@/components';
import type { BasicUser, FixedTeamUserTeam } from '@/types';
import { fixedTeamUserTeamTint, UT_ACCENT_TEXT } from '@/utils/fixedTeamUserTeam';
import { EASE_CLASS, FACE_CUTOUT_CLASS } from './scoreEntryStyles';
import { teamLabel } from './teamLabel';

export type TeamSideState = 'leading' | 'trailing' | 'neutral';

interface ScoreEntryTeamPanelProps {
  players: BasicUser[];
  /** The side is a fixed team that is a user team: its name (team colour) leads, first names follow. */
  userTeam?: FixedTeamUserTeam | null;
  sideState: TeamSideState;
  /** `column`: faces over names (portrait board). `row`: faces beside names (landscape board). */
  orientation?: 'column' | 'row';
}

const NAME_TONE: Record<TeamSideState, string> = {
  leading: 'text-gray-900 dark:text-white',
  neutral: 'text-gray-700 dark:text-gray-200',
  trailing: 'text-gray-500 dark:text-gray-400',
};

export const ScoreEntryTeamPanel = ({
  players,
  userTeam = null,
  sideState,
  orientation = 'column',
}: ScoreEntryTeamPanelProps) => {
  const isRow = orientation === 'row';
  const align = isRow ? 'text-start' : 'max-w-full text-center';

  return (
    <div
      className={
        isRow
          ? 'flex min-w-0 items-center gap-2.5'
          : 'flex min-w-0 flex-col items-center justify-end gap-2 px-1'
      }
    >
      <div className="flex shrink-0 items-center -space-x-2.5">
        {players.map((player) => (
          <span
            key={player.id}
            className={`${FACE_CUTOUT_CLASS} ring-white dark:ring-gray-800`}
          >
            <PlayerAvatar
              player={player}
              inlineFace
              inlineFaceSize="md"
              inlineFacePlain
              inlineFaceFlatStack
              showName={false}
              draggable={false}
            />
          </span>
        ))}
      </div>
      {userTeam ? (
        <div className={`min-w-0 ${align}`} style={fixedTeamUserTeamTint(userTeam.color).vars}>
          <p
            className={`line-clamp-1 text-[12.5px] font-bold leading-tight transition-opacity duration-500 ${EASE_CLASS} ${UT_ACCENT_TEXT} ${
              sideState === 'trailing' ? 'opacity-70' : ''
            }`}
          >
            {userTeam.name}
          </p>
          <p
            className={`mt-0.5 line-clamp-1 text-[11px] font-medium leading-tight transition-colors duration-500 ${EASE_CLASS} ${NAME_TONE[sideState]}`}
          >
            {teamLabel(players)}
          </p>
        </div>
      ) : (
        <p
          className={`line-clamp-2 min-w-0 text-[12px] font-medium leading-tight transition-colors duration-500 ${EASE_CLASS} ${align} ${NAME_TONE[sideState]}`}
        >
          {teamLabel(players)}
        </p>
      )}
    </div>
  );
};
