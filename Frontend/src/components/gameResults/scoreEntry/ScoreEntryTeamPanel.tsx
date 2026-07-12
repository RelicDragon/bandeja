import { PlayerAvatar } from '@/components';
import { BasicUser } from '@/types';

export type TeamSideState = 'leading' | 'trailing' | 'neutral';

interface ScoreEntryTeamPanelProps {
  players: BasicUser[];
  sideState: TeamSideState;
  showNames?: boolean;
}

const teamLabel = (players: BasicUser[]) =>
  players
    .map((p) => p.firstName || p.lastName || '?')
    .join(' · ');

export const ScoreEntryTeamPanel = ({
  players,
  sideState,
  showNames = true,
}: ScoreEntryTeamPanelProps) => (
  <div
    className={`flex h-full min-h-[3.75rem] flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 ${
      sideState === 'leading'
        ? 'bg-emerald-50/80 dark:bg-emerald-950/25'
        : 'bg-gray-50/80 dark:bg-gray-800/40'
    }`}
  >
    <div className="flex items-center justify-center -space-x-2">
      {players.map((player) => (
        <PlayerAvatar
          key={player.id}
          player={player}
          inlineFace
          inlineFacePlain
          inlineFaceFlatStack
          showName={false}
          draggable={false}
        />
      ))}
    </div>
    {showNames ? (
      <p className="line-clamp-2 max-w-full text-center text-[11px] font-medium leading-tight text-gray-600 dark:text-gray-400">
        {teamLabel(players)}
      </p>
    ) : null}
  </div>
);
