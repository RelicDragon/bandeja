import { PlayerAvatar } from '@/components';
import { User } from '@/types';
import { Match } from '@/types/gameResults';

interface AvailablePlayersFooterProps {
  players: User[];
  editingMatch: Match | undefined;
  draggedPlayer: string | null;
  onDragStart: (e: React.DragEvent, playerId: string) => void;
  onDragEnd: () => void;
  onTouchStart: (e: TouchEvent, playerId: string) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
}

export const AvailablePlayersFooter = ({
  players,
  editingMatch,
  draggedPlayer,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: AvailablePlayersFooterProps) => {
  const availablePlayers = players.filter(player => {
    if (!editingMatch) return true;
    return !editingMatch.teamA.includes(player.id) && !editingMatch.teamB.includes(player.id);
  });

  const maxPlayersPerTeam = players.length === 2 ? 1 : 2;
  const teamsAreFull = editingMatch &&
    editingMatch.teamA.length >= maxPlayersPerTeam &&
    editingMatch.teamB.length >= maxPlayersPerTeam;

  const shouldShow = availablePlayers.length > 0 && !teamsAreFull;

  return (
    <div 
      className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t-2 border-blue-400 dark:border-blue-600 shadow-lg z-30 transition-transform duration-300 ease-in-out ${
        shouldShow ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="px-4 py-3 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
        <div className="flex gap-2 w-max">
          {availablePlayers.map(player => (
            <div
              key={player.id}
              className={`transition-all duration-200 flex-shrink-0 ${
                draggedPlayer === player.id
                  ? 'opacity-0'
                  : 'hover:scale-105'
              }`}
            >
              <PlayerAvatar
                player={player}
                showName={true}
                smallLayout={true}
                draggable={true}
                onDragStart={(e) => onDragStart(e, player.id)}
                onDragEnd={onDragEnd}
                onTouchStart={(e) => onTouchStart(e, player.id)}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

