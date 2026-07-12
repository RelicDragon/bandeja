import { PlayerAvatar } from '@/components';
import { BasicUser } from '@/types';

interface ScoreEntryTeamPanelProps {
  players: BasicUser[];
  isLeading: boolean;
  className?: string;
}

export const ScoreEntryTeamPanel = ({ players, isLeading, className = '' }: ScoreEntryTeamPanelProps) => (
  <div
    className={`flex flex-wrap items-start justify-center gap-1.5 rounded-xl border p-2 transition-colors duration-200 ${
      isLeading
        ? 'border-emerald-300/80 bg-emerald-50/80 dark:border-emerald-700/60 dark:bg-emerald-950/30'
        : 'border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/60'
    } ${className}`.trim()}
  >
    {players.map((player) => (
      <PlayerAvatar key={player.id} player={player} showName extrasmall draggable={false} />
    ))}
  </div>
);
