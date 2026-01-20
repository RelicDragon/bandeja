import { Trash2, MapPin } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser, Court } from '@/types';

interface HorizontalMatchCardProps {
  match: Match;
  matchIndex: number;
  players: BasicUser[];
  isPresetGame: boolean;
  isEditing: boolean;
  canEditResults: boolean;
  draggedPlayer: string | null;
  showDeleteButton: boolean;
  onRemoveMatch: () => void;
  onMatchClick: () => void;
  onSetClick: (setIndex: number) => void;
  onRemovePlayer: (team: 'teamA' | 'teamB', playerId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, team: 'teamA' | 'teamB') => void;
  onPlayerPlaceholderClick: (team: 'teamA' | 'teamB') => void;
  canEnterResults: boolean;
  showCourtLabel?: boolean;
  selectedCourt?: Court | null;
  courts?: Court[];
  onCourtClick?: () => void;
  fixedNumberOfSets?: number;
  prohibitMatchesEditing?: boolean;
}

export const HorizontalMatchCard = ({
  match,
  matchIndex,
  players,
  isPresetGame,
  isEditing,
  canEditResults,
  draggedPlayer,
  showDeleteButton,
  onRemoveMatch,
  onMatchClick,
  onSetClick,
  onRemovePlayer,
  onDragOver,
  onDrop,
  onPlayerPlaceholderClick,
  canEnterResults,
  showCourtLabel = false,
  selectedCourt,
  onCourtClick,
  fixedNumberOfSets,
  prohibitMatchesEditing = false,
}: HorizontalMatchCardProps) => {
  const effectiveIsPresetGame = isPresetGame || prohibitMatchesEditing;
  const effectiveIsEditing = prohibitMatchesEditing ? false : isEditing;
  const displaySets = fixedNumberOfSets && fixedNumberOfSets > 0
    ? Array.from({ length: fixedNumberOfSets }, (_, i) => match.sets[i] || { teamA: 0, teamB: 0, isTieBreak: false })
    : (() => {
        const sets = [...match.sets];
        if (sets.length > 0) {
          const lastSet = sets[sets.length - 1];
          if ((lastSet.teamA > 0 || lastSet.teamB > 0) && !lastSet.isTieBreak) {
            sets.push({ teamA: 0, teamB: 0, isTieBreak: false });
          }
        }
        return sets;
      })();
  const renderTeam = (team: 'teamA' | 'teamB') => {
    const teamPlayers = match[team];
    const maxPlayersPerTeam = players.length === 2 ? 1 : 2;
    const isWinner = match.winnerId === team;
    
    return (
      <div
        data-drop-zone
        data-match-id={match.id}
        data-team={team}
        className={`min-h-[40px] px-0 py-2 w-full flex items-center justify-center relative ${
          effectiveIsPresetGame 
            ? ''
            : (effectiveIsEditing || draggedPlayer) && canEditResults ? 'border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg transition-colors' : ''
        } ${
          !effectiveIsPresetGame && canEditResults && draggedPlayer ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : ''
        } ${
          isWinner ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg' : ''
        }`}
        onDragOver={!effectiveIsPresetGame && canEditResults ? onDragOver : undefined}
        onDrop={!effectiveIsPresetGame && canEditResults ? (e) => onDrop(e, team) : undefined}
      >
        <div className="flex gap-5 justify-center">
          {teamPlayers.map(playerId => {
            const player = players.find(p => p.id === playerId);
            return player ? (
              <div key={playerId} className="flex flex-col items-center">
                <PlayerAvatar
                  player={player}
                  draggable={false}
                  showName={true}
                  extrasmall={true}
                />
                {!effectiveIsPresetGame && effectiveIsEditing && canEditResults && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePlayer(team, playerId);
                    }}
                    className="mt-1 w-7 h-7 rounded-full bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors border-2 border-white dark:border-gray-900"
                  >
                    <Trash2 size={14} className="text-white" />
                  </button>
                )}
              </div>
            ) : null;
          })}
          {Array.from({ length: Math.max(0, maxPlayersPerTeam - teamPlayers.length) }).map((_, index) => (
            <div key={`placeholder-${index}`}>
              <div
                onClick={() => {
                  if (!effectiveIsPresetGame && effectiveIsEditing && canEditResults) {
                    onPlayerPlaceholderClick(team);
                  }
                }}
                className={`${
                  !effectiveIsPresetGame && effectiveIsEditing && canEditResults ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                }`}
              >
                <PlayerAvatar
                  player={null}
                  showName={false}
                  extrasmall={true}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative px-0 pt-2 pb-2" data-match-container>
      {matchIndex > 0 && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gray-200 dark:bg-gray-700"></div>
      )}

      {showCourtLabel && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onCourtClick && canEditResults) {
              onCourtClick();
            }
          }}
          className={`absolute -top-1 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
            canEditResults
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 cursor-default'
          }`}
        >
          <MapPin size={10} />
          <span>{selectedCourt?.name || 'Court'}</span>
        </button>
      )}

      {showDeleteButton && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveMatch();
          }}
          className="absolute top-0 right-0 w-8 h-8 rounded-full border-2 border-red-500 hover:border-red-600 bg-white dark:bg-gray-800 text-red-500 hover:text-red-600 flex items-center justify-center transition-colors shadow-lg z-10"
        >
          <Trash2 size={16} />
        </button>
      )}

      <div 
        className={`${!effectiveIsPresetGame && effectiveIsEditing && canEditResults ? 'ring-2 ring-green-400 dark:ring-green-500 rounded-lg px-1 py-4 bg-green-50 dark:bg-green-900/20 w-full' : 'w-full'} ${!effectiveIsPresetGame && canEditResults ? 'cursor-pointer' : ''}`}
        onClick={!effectiveIsPresetGame && canEditResults ? (e) => {
          e.stopPropagation();
          onMatchClick();
        } : undefined}
      >
        <div className="flex items-center justify-between w-full gap-1">
          <div className="flex-1 flex justify-start">
            {renderTeam('teamA')}
          </div>
          
          {canEnterResults && (
            <div className="flex items-center gap-2">
              {displaySets.map((set, setIndex) => {
                const teamAScore = set.teamA;
                const teamBScore = set.teamB;
                const isEditable = (effectiveIsPresetGame || (!effectiveIsPresetGame && effectiveIsEditing)) && canEditResults;
                const teamAIsWinning = teamAScore > teamBScore && teamAScore > 0 && teamBScore >= 0;
                const teamAIsLosing = teamAScore < teamBScore && teamAScore >= 0 && teamBScore > 0;
                const teamAIsTie = teamAScore === teamBScore && teamAScore > 0 && teamBScore > 0;
                const teamBIsWinning = teamBScore > teamAScore && teamBScore > 0 && teamAScore >= 0;
                const teamBIsLosing = teamBScore < teamAScore && teamBScore >= 0 && teamAScore > 0;
                const teamBIsTie = teamAScore === teamBScore && teamAScore > 0 && teamBScore > 0;
                const shouldShowScore = set.teamA !== 0 || set.teamB !== 0 || effectiveIsPresetGame || effectiveIsEditing || (fixedNumberOfSets && fixedNumberOfSets > 0);

                if (!shouldShowScore) return null;

                return (
                  <div key={setIndex} className="flex items-center gap-1">
                    <button
                      onClick={isEditable ? (e) => {
                        e.stopPropagation();
                        onSetClick(setIndex);
                      } : undefined}
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg" />
                      <div className={`relative w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 flex items-center justify-center rounded-xl border-2 transition-all duration-200 shadow-lg group-hover:shadow-xl group-hover:scale-105 active:scale-95 ${
                        teamAIsWinning
                          ? 'bg-gradient-to-br from-green-100/90 to-green-200/80 dark:from-green-900/40 dark:to-green-800/30 border-green-300/70 dark:border-green-700/50 shadow-green-500/30'
                          : teamAIsLosing
                            ? 'bg-gradient-to-br from-red-50/60 to-red-100/40 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/40 shadow-red-500/20'
                            : teamAIsTie
                              ? 'bg-gradient-to-br from-yellow-100/90 to-yellow-200/80 dark:from-yellow-900/40 dark:to-yellow-800/30 border-yellow-300/70 dark:border-yellow-700/50 shadow-yellow-500/30'
                              : isEditable
                                ? 'bg-gradient-to-br from-blue-50/80 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-300/70 dark:border-blue-600/50 cursor-pointer'
                                : 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-gray-200 dark:border-gray-700 cursor-default'
                      }`}>
                        <span className={`font-bold bg-gradient-to-br bg-clip-text text-transparent ${
                          teamAIsWinning
                            ? 'from-green-700 to-green-600 dark:from-green-300 dark:to-green-400'
                            : teamAIsLosing
                              ? 'from-red-700 to-red-600 dark:from-red-300 dark:to-red-400'
                              : teamAIsTie
                                ? 'from-yellow-700 to-yellow-600 dark:from-yellow-300 dark:to-yellow-400'
                                : 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300'
                        } text-xl sm:text-2xl md:text-3xl`}>
                          {teamAScore}
                        </span>
                      </div>
                    </button>
                    <span className="text-gray-400 dark:text-gray-600 text-xl sm:text-2xl md:text-3xl font-bold">:</span>
                    <button
                      onClick={isEditable ? (e) => {
                        e.stopPropagation();
                        onSetClick(setIndex);
                      } : undefined}
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg" />
                      <div className={`relative w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 flex items-center justify-center rounded-xl border-2 transition-all duration-200 shadow-lg group-hover:shadow-xl group-hover:scale-105 active:scale-95 ${
                        teamBIsWinning
                          ? 'bg-gradient-to-br from-green-100/90 to-green-200/80 dark:from-green-900/40 dark:to-green-800/30 border-green-300/70 dark:border-green-700/50 shadow-green-500/30'
                          : teamBIsLosing
                            ? 'bg-gradient-to-br from-red-50/60 to-red-100/40 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/40 shadow-red-500/20'
                            : teamBIsTie
                              ? 'bg-gradient-to-br from-yellow-100/90 to-yellow-200/80 dark:from-yellow-900/40 dark:to-yellow-800/30 border-yellow-300/70 dark:border-yellow-700/50 shadow-yellow-500/30'
                              : isEditable
                                ? 'bg-gradient-to-br from-blue-50/80 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-300/70 dark:border-blue-600/50 cursor-pointer'
                                : 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-gray-200 dark:border-gray-700 cursor-default'
                      }`}>
                        <span className={`font-bold bg-gradient-to-br bg-clip-text text-transparent ${
                          teamBIsWinning
                            ? 'from-green-700 to-green-600 dark:from-green-300 dark:to-green-400'
                            : teamBIsLosing
                              ? 'from-red-700 to-red-600 dark:from-red-300 dark:to-red-400'
                              : teamBIsTie
                                ? 'from-yellow-700 to-yellow-600 dark:from-yellow-300 dark:to-yellow-400'
                                : 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300'
                        } text-xl sm:text-2xl md:text-3xl`}>
                          {teamBScore}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          
          <div className="flex-1 flex justify-end">
            {renderTeam('teamB')}
          </div>
        </div>
      </div>
    </div>
  );
};

