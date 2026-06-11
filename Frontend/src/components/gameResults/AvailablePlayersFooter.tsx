import { createPortal } from 'react-dom';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BasicUser, GameParticipant } from '@/types';
import { Match } from '@/types/gameResults';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { maxPlayersPerTeamForGame, teamSideSlotsFull } from '@/utils/matchFormat';

interface AvailablePlayersFooterProps {
  players: BasicUser[];
  editingMatch: Match | undefined;
  roundMatches?: Match[];
  draggedPlayer: string | null;
  playersPerMatch?: number;
  sport?: string | null;
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
  playersPerMatch,
  sport,
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

  const maxPlayersPerTeam = maxPlayersPerTeamForGame({ playersPerMatch, sport }, players.length);
  const teamsAreFull =
    editingMatch &&
    teamSideSlotsFull(editingMatch, 'teamA', maxPlayersPerTeam) &&
    teamSideSlotsFull(editingMatch, 'teamB', maxPlayersPerTeam);

  const shouldShow = availablePlayers.length > 0 && !teamsAreFull;

  const participants: GameParticipant[] = useMemo(() => {
    return availablePlayers.map(player => ({
      userId: player.id,
      role: 'PARTICIPANT' as const,
      status: 'PLAYING' as const,
      joinedAt: new Date().toISOString(),
      user: player,
    }));
  }, [availablePlayers]);

  if (!shouldShow) {
    return null;
  }

  return createPortal(
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="fixed left-0 right-0 bottom-0 z-50 bg-white/90 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md dark:bg-gray-800/90"
    >
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
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
    </motion.div>,
    document.body
  );
};

