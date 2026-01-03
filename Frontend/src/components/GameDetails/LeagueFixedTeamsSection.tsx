import { Award } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Game } from '@/types';

interface LeagueFixedTeamsSectionProps {
  game: Game;
}

export const LeagueFixedTeamsSection = ({ game }: LeagueFixedTeamsSectionProps) => {
  const getTeamPlayers = (teamIndex: number) => {
    if (game.fixedTeams && game.fixedTeams.length > teamIndex) {
      return game.fixedTeams[teamIndex].players
        .filter((tp) => tp.user)
        .map((tp) => tp.user!);
    }
    return [];
  };

  const teamAPlayers = getTeamPlayers(0);
  const teamBPlayers = getTeamPlayers(1);
  const teamAPlayerIds = teamAPlayers.map((p) => p.id);
  const teamBPlayerIds = teamBPlayers.map((p) => p.id);
  const isFinal = game.resultsStatus === 'FINAL';

  let winner: 'teamA' | 'teamB' | null = null;
  let isTie = false;

  if (isFinal && game.outcomes && game.outcomes.length > 0) {
    const teamAOutcomes = game.outcomes.filter((o) => teamAPlayerIds.includes(o.user?.id || ''));
    const teamBOutcomes = game.outcomes.filter((o) => teamBPlayerIds.includes(o.user?.id || ''));
    const teamAWins = teamAOutcomes.reduce((sum, o) => sum + (o.wins || 0), 0);
    const teamBWins = teamBOutcomes.reduce((sum, o) => sum + (o.wins || 0), 0);

    if (teamAWins > teamBWins) {
      winner = 'teamA';
    } else if (teamBWins > teamAWins) {
      winner = 'teamB';
    } else {
      isTie = true;
    }
  }

  const renderTeam = (players: typeof teamAPlayers, highlight: boolean) => (
    <div
      className={`min-h-[48px] p-3 flex items-center justify-center ${
        highlight
          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-500 rounded-lg'
          : isTie
          ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-500 rounded-lg'
          : ''
      }`}
    >
      <div className="flex gap-2 justify-center">
        {players.map((player) => (
          <PlayerAvatar
            key={player.id}
            player={player}
            draggable={false}
            showName={true}
            extrasmall={true}
            removable={false}
          />
        ))}
      </div>
    </div>
  );

  const renderBadge = (show: boolean, color: 'yellow' | 'blue') => {
    if (!show) return null;
    const colorClass = color === 'yellow' ? 'bg-yellow-400 dark:bg-yellow-500' : 'bg-blue-400 dark:bg-blue-500';
    return (
      <div className={`absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full ${colorClass} border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-lg`}>
        <Award size={16} className="text-white" fill="white" />
      </div>
    );
  };

  return (
    <div className="flex items-center justify-center w-full gap-4 py-2">
      <div className="flex justify-start relative">
        {renderTeam(teamAPlayers, winner === 'teamA')}
        {renderBadge(isFinal && winner === 'teamA', 'yellow')}
        {renderBadge(isFinal && isTie, 'blue')}
      </div>

      <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
        VS
      </div>

      <div className="flex justify-start relative">
        {renderTeam(teamBPlayers, winner === 'teamB')}
        {renderBadge(isFinal && winner === 'teamB', 'yellow')}
        {renderBadge(isFinal && isTie, 'blue')}
      </div>
    </div>
  );
};

