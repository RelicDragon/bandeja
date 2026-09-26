import { PlayerAvatar } from '@/components';
import { BasicUser } from '@/types';
import { EASE_CLASS, FACE_CUTOUT_CLASS } from './scoreEntryStyles';
import { teamLabel } from './teamLabel';

export type TeamSideState = 'leading' | 'trailing' | 'neutral';

interface ScoreEntryTeamPanelProps {
  players: BasicUser[];
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
  sideState,
  orientation = 'column',
}: ScoreEntryTeamPanelProps) => {
  const isRow = orientation === 'row';

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
      <p
        className={`line-clamp-2 min-w-0 text-[12px] font-medium leading-tight transition-colors duration-500 ${EASE_CLASS} ${
          isRow ? 'text-start' : 'max-w-full text-center'
        } ${NAME_TONE[sideState]}`}
      >
        {teamLabel(players)}
      </p>
    </div>
  );
};
