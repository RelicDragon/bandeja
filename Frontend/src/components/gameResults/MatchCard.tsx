import { Trash2, MapPin } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser, Court } from '@/types';

interface MatchCardProps {
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

export const MatchCard = ({
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
}: MatchCardProps) => {
  const effectiveIsPresetGame = isPresetGame || prohibitMatchesEditing;
  const effectiveIsEditing = prohibitMatchesEditing ? false : isEditing;
  const canEnterScores = effectiveIsEditing || (effectiveIsPresetGame && canEditResults);
  
  const displaySets = fixedNumberOfSets && fixedNumberOfSets > 0
    ? Array.from({ length: fixedNumberOfSets }, (_, i) => match.sets[i] || { teamA: 0, teamB: 0, isTieBreak: false })
    : (() => {
        const sets = [...match.sets];
        
        if (canEnterScores) {
          // When we can enter scores, always ensure there's a trailing 0:0 set for adding scores
          if (sets.length === 0) {
            sets.push({ teamA: 0, teamB: 0, isTieBreak: false });
          } else {
            const lastSet = sets[sets.length - 1];
            if ((lastSet.teamA > 0 || lastSet.teamB > 0) && !lastSet.isTieBreak) {
              sets.push({ teamA: 0, teamB: 0, isTieBreak: false });
            }
          }
        } else {
          // When not entering scores, only add trailing 0:0 if last set has scores
          if (sets.length > 0) {
            const lastSet = sets[sets.length - 1];
            if ((lastSet.teamA > 0 || lastSet.teamB > 0) && !lastSet.isTieBreak) {
              sets.push({ teamA: 0, teamB: 0, isTieBreak: false });
            }
          }
        }
        
        return sets;
      })();

  const hasNonZeroScore = match.sets.some(set => set.teamA > 0 || set.teamB > 0);
  const shouldHideCard = !canEnterScores && !hasNonZeroScore && !canEditResults;

  if (shouldHideCard) {
    return null;
  }

  const renderTeam = (team: 'teamA' | 'teamB') => {
    const teamPlayers = match[team];
    const maxPlayersPerTeam = players.length === 2 ? 1 : 2;
    const isWinner = match.winnerId === team;
    
    return (
      <div
        data-drop-zone
        data-match-id={match.id}
        data-team={team}
        className={`min-h-[32px] p-1 w-full flex items-center justify-center relative ${
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
        <div className="flex gap-3 justify-center">
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
    <div className="relative pr-2 pl-2 pt-2 pb-2" data-match-container>
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
          className={`absolute -top-1 z-10 flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${showDeleteButton ? 'right-12' : 'right-0'} ${
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
        className={`${!effectiveIsPresetGame && effectiveIsEditing && canEditResults ? 'ring-2 ring-green-400 dark:ring-green-500 rounded-lg p-4 bg-green-50 dark:bg-green-900/20 w-full' : 'w-full'} ${!effectiveIsPresetGame && canEditResults ? 'cursor-pointer' : ''}`}
        onClick={!effectiveIsPresetGame && canEditResults ? (e) => {
          e.stopPropagation();
          onMatchClick();
        } : undefined}
      >
        {canEnterResults ? (
          <div className="overflow-x-auto w-full">
            <div className="grid gap-1 min-w-max" style={{
              gridTemplateColumns: `max-content repeat(${displaySets.length}, 40px)`,
              gridTemplateRows: 'auto 2px auto'
            }}>
              <div className="flex items-center justify-center" style={{ gridColumn: '1', gridRow: '1' }}>
                {renderTeam('teamA')}
              </div>
              
              {displaySets.map((_, setIndex) => {
                const set = displaySets[setIndex];
                const teamAScore = set.teamA;
                const teamBScore = set.teamB;
                const isEditable = (effectiveIsPresetGame || (!effectiveIsPresetGame && effectiveIsEditing)) && canEditResults;
                const isWinning = teamAScore > teamBScore && teamAScore > 0 && teamBScore >= 0;
                const isLosing = teamAScore < teamBScore && teamAScore >= 0 && teamBScore > 0;
                const isTie = teamAScore === teamBScore && teamAScore > 0 && teamBScore > 0;

                const shouldShowScore = set.teamA !== 0 || set.teamB !== 0 || canEnterScores;

                return (
                <div key={`teamA-${setIndex}`} className="flex items-center justify-center" style={{
                  gridColumn: `${setIndex + 2}`,
                  gridRow: '1',
                  transform: 'translateY(-15%)'
                }}>
                    {shouldShowScore && (
                  <button
                        onClick={isEditable ? () => onSetClick(setIndex) : undefined}
                        className="relative group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg" />
                        <div className={`relative w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 flex items-center justify-center rounded-xl border-2 transition-all duration-200 shadow-lg group-hover:shadow-xl group-hover:scale-105 active:scale-95 ${
                          isWinning
                            ? 'bg-gradient-to-br from-green-100/90 to-green-200/80 dark:from-green-900/40 dark:to-green-800/30 border-green-300/70 dark:border-green-700/50 shadow-green-500/30'
                            : isLosing
                              ? 'bg-gradient-to-br from-red-50/60 to-red-100/40 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/40 shadow-red-500/20'
                              : isTie
                                ? 'bg-gradient-to-br from-yellow-100/90 to-yellow-200/80 dark:from-yellow-900/40 dark:to-yellow-800/30 border-yellow-300/70 dark:border-yellow-700/50 shadow-yellow-500/30'
                                : isEditable
                                  ? 'bg-gradient-to-br from-blue-50/80 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-300/70 dark:border-blue-600/50 cursor-pointer'
                                  : 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-gray-200 dark:border-gray-700 cursor-default'
                        }`}>
                          <span className={`font-bold bg-gradient-to-br bg-clip-text text-transparent ${
                            isWinning
                              ? 'from-green-700 to-green-600 dark:from-green-300 dark:to-green-400'
                              : isLosing
                                ? 'from-red-700 to-red-600 dark:from-red-300 dark:to-red-400'
                                : isTie
                                  ? 'from-yellow-700 to-yellow-600 dark:from-yellow-300 dark:to-yellow-400'
                                  : 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300'
                          } text-xl sm:text-2xl md:text-3xl`}>
                            {set.teamA}
                          </span>
                        </div>
                        {set.isTieBreak && (
                          <span className="absolute -top-1 -right-1 text-[8px] sm:text-[9px] font-bold text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-800 px-1 rounded">
                            TB
                          </span>
                        )}
                  </button>
                    )}
                </div>
                );
              })}
              
              {displaySets.map((_, setIndex) => {
                const set = displaySets[setIndex];
                const shouldShowScore = set.teamA !== 0 || set.teamB !== 0 || canEnterScores;
                const hasNonZeroScore = set.teamA !== 0 || set.teamB !== 0;
                return (
                  <div
                    key={`dot-${setIndex}`}
                    className="flex items-center justify-center"
                    style={{
                      gridColumn: `${setIndex + 2}`,
                      gridRow: '2'
                    }}
                  >
                    {shouldShowScore && (
                      <div className={`mb-5 rounded-full ${
                        hasNonZeroScore 
                          ? 'w-1 h-1 bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-600 dark:from-yellow-400 dark:via-yellow-500 dark:to-yellow-700 ring-2 ring-yellow-500/50 dark:ring-yellow-400/50 shadow-[0_0_8px_rgba(234,179,8,0.6)] dark:shadow-[0_0_8px_rgba(250,204,21,0.6)]' 
                          : 'w-1 h-1 bg-gray-400 dark:bg-gray-500'
                      }`} />
                    )}
                  </div>
                );
              })}
              
              <div className="flex items-center justify-center" style={{ gridColumn: '1', gridRow: '3' }}>
                {renderTeam('teamB')}
              </div>
              
              {displaySets.map((_, setIndex) => {
                const set = displaySets[setIndex];
                const teamAScore = set.teamA;
                const teamBScore = set.teamB;
                const isEditable = (effectiveIsPresetGame || (!effectiveIsPresetGame && effectiveIsEditing)) && canEditResults;
                const isWinning = teamBScore > teamAScore && teamBScore > 0 && teamAScore >= 0;
                const isLosing = teamBScore < teamAScore && teamBScore >= 0 && teamAScore > 0;
                const isTie = teamAScore === teamBScore && teamAScore > 0 && teamBScore > 0;

                const shouldShowScore = set.teamA !== 0 || set.teamB !== 0 || canEnterScores;

                return (
                <div key={`teamB-${setIndex}`} className="flex items-center justify-center" style={{
                  gridColumn: `${setIndex + 2}`,
                  gridRow: '3',
                  transform: 'translateY(-15%)'
                }}>
                    {shouldShowScore && (
                  <button
                        onClick={isEditable ? () => onSetClick(setIndex) : undefined}
                        className="relative group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg" />
                        <div className={`relative w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 flex items-center justify-center rounded-xl border-2 transition-all duration-200 shadow-lg group-hover:shadow-xl group-hover:scale-105 active:scale-95 ${
                          isWinning
                            ? 'bg-gradient-to-br from-green-100/90 to-green-200/80 dark:from-green-900/40 dark:to-green-800/30 border-green-300/70 dark:border-green-700/50 shadow-green-500/30'
                            : isLosing
                              ? 'bg-gradient-to-br from-red-50/60 to-red-100/40 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/40 shadow-red-500/20'
                              : isTie
                                ? 'bg-gradient-to-br from-yellow-100/90 to-yellow-200/80 dark:from-yellow-900/40 dark:to-yellow-800/30 border-yellow-300/70 dark:border-yellow-700/50 shadow-yellow-500/30'
                              : isEditable
                                ? 'bg-gradient-to-br from-blue-50/80 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-300/70 dark:border-blue-600/50 cursor-pointer'
                                : 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-gray-200 dark:border-gray-700 cursor-default'
                        }`}>
                          <span className={`font-bold bg-gradient-to-br bg-clip-text text-transparent ${
                            isWinning
                              ? 'from-green-700 to-green-600 dark:from-green-300 dark:to-green-400'
                              : isLosing
                                ? 'from-red-700 to-red-600 dark:from-red-300 dark:to-red-400'
                              : isTie
                                ? 'from-yellow-700 to-yellow-600 dark:from-yellow-300 dark:to-yellow-400'
                                : 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300'
                          } text-xl sm:text-2xl md:text-3xl`}>
                            {set.teamB}
                          </span>
                        </div>
                        {set.isTieBreak && (
                          <span className="absolute -top-1 -right-1 text-[8px] sm:text-[9px] font-bold text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-800 px-1 rounded">
                            TB
                          </span>
                        )}
                  </button>
                    )}
                </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <div className="grid gap-1 min-w-max" style={{
              gridTemplateColumns: `max-content`,
              gridTemplateRows: 'auto auto'
            }}>
              <div className="flex items-center justify-center" style={{ gridColumn: '1', gridRow: '1' }}>
                {renderTeam('teamA')}
              </div>
              
              <div className="flex items-center justify-center" style={{ gridColumn: '1', gridRow: '2' }}>
                {renderTeam('teamB')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

