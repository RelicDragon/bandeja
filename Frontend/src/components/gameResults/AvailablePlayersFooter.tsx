import { createPortal } from 'react-dom';
import { useMemo } from 'react';
import { BasicUser, GameParticipant } from '@/types';
import { Match } from '@/types/gameResults';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';

interface AvailablePlayersFooterProps {
  players: BasicUser[];
  editingMatch: Match | undefined;
  roundMatches?: Match[];
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
  roundMatches = [],
  draggedPlayer,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: AvailablePlayersFooterProps) => {
  const playersInRound = new Set<string>();
  roundMatches.forEach(match => {
    match.teamA.forEach(id => playersInRound.add(id));
    match.teamB.forEach(id => playersInRound.add(id));
  });

  const availablePlayers = players.filter(player => {
    if (playersInRound.has(player.id)) return false;
    if (!editingMatch) return true;
    return !editingMatch.teamA.includes(player.id) && !editingMatch.teamB.includes(player.id);
  });

  const maxPlayersPerTeam = players.length === 2 ? 1 : 2;
  const teamsAreFull = editingMatch &&
    editingMatch.teamA.length >= maxPlayersPerTeam &&
    editingMatch.teamB.length >= maxPlayersPerTeam;

  const shouldShow = availablePlayers.length > 0 && !teamsAreFull;

  const participants: GameParticipant[] = useMemo(() => {
    return availablePlayers.map(player => ({
      userId: player.id,
      role: 'PARTICIPANT' as const,
      isPlaying: true,
      joinedAt: new Date().toISOString(),
      user: player,
    }));
  }, [availablePlayers]);

  if (!shouldShow) {
    return null;
  }

  return createPortal(
    <div 
      className="fixed left-0 right-0 bottom-0 bg-white dark:bg-gray-800 border-t-2 border-blue-400 dark:border-blue-600 shadow-lg z-50 transition-transform duration-300 ease-in-out"
    >
      <div className="px-4 py-3 pb-safe">
        <PlayersCarousel
          participants={participants}
          draggable={true}
          draggedPlayerId={draggedPlayer}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          autoHideNames={false}
        />
      </div>
    </div>,
    document.body
  );
};

