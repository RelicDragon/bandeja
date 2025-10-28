import { Trash2, MapPin } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { User, Court } from '@/types';

interface MatchCardProps {
  match: Match;
  matchIndex: number;
  players: User[];
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
}: MatchCardProps) => {
  const renderTeam = (team: 'teamA' | 'teamB') => {
    const teamPlayers = match[team];
    const maxPlayersPerTeam = players.length === 2 ? 1 : 2;
    
    return (
      <div
        data-drop-zone
        data-match-id={match.id}
        data-team={team}
        className={`min-h-[40px] p-2 w-full flex items-center justify-center ${
          isPresetGame 
            ? ''
            : (isEditing || draggedPlayer) && canEditResults ? 'border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg transition-colors' : ''
        } ${
          !isPresetGame && canEditResults && draggedPlayer ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : ''
        }`}
        onDragOver={!isPresetGame && canEditResults ? onDragOver : undefined}
        onDrop={!isPresetGame && canEditResults ? (e) => onDrop(e, team) : undefined}
      >
        <div className="flex gap-1 justify-center">
          {teamPlayers.map(playerId => {
            const player = players.find(p => p.id === playerId);
            return player ? (
              <div key={playerId}>
                <PlayerAvatar
                  player={player}
                  draggable={false}
                  showName={true}
                  extrasmall={true}
                  removable={!isPresetGame && isEditing && canEditResults}
                  onRemoveClick={!isPresetGame && isEditing && canEditResults ? () => onRemovePlayer(team, playerId) : undefined}
                />
              </div>
            ) : null;
          })}
          {Array.from({ length: Math.max(0, maxPlayersPerTeam - teamPlayers.length) }).map((_, index) => (
            <div key={`placeholder-${index}`}>
              <div
                onClick={() => {
                  if (!isPresetGame && isEditing && canEditResults) {
                    onPlayerPlaceholderClick(team);
                  }
                }}
                className={`${
                  !isPresetGame && isEditing && canEditResults ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
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
            if (onCourtClick) {
              onCourtClick();
            }
          }}
          className="absolute -top-1 left-1 z-50 flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
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
        className={`${!isPresetGame && isEditing && canEditResults ? 'ring-2 ring-green-400 dark:ring-green-500 rounded-lg p-4 bg-green-50 dark:bg-green-900/20 w-full' : 'w-full'} ${!isPresetGame && canEditResults ? 'cursor-pointer' : ''}`}
        onClick={!isPresetGame && canEditResults ? (e) => {
          e.stopPropagation();
          onMatchClick();
        } : undefined}
      >
        {canEnterResults ? (
          <div className="overflow-x-auto w-full">
            <div className="grid gap-2 min-w-max" style={{
              gridTemplateColumns: `max-content repeat(${match.sets.length}, 40px)`,
              gridTemplateRows: 'auto auto'
            }}>
              <div className="flex items-center justify-center" style={{ gridColumn: '1', gridRow: '1' }}>
                {renderTeam('teamA')}
              </div>
              
              {match.sets.map((_, setIndex) => (
                <div key={`teamA-${setIndex}`} className="flex items-center justify-center" style={{
                  gridColumn: `${setIndex + 2}`,
                  gridRow: '1',
                  transform: 'translateY(-15%)'
                }}>
                  <button
                    onClick={() => onSetClick(setIndex)}
                    className={`text-2xl font-bold transition-colors ${
                      (isPresetGame || (!isPresetGame && isEditing)) && canEditResults
                        ? 'text-orange-500 hover:text-orange-600 cursor-pointer'
                        : 'text-gray-400 dark:text-gray-600 cursor-default'
                    }`}
                  >
                    {match.sets[setIndex].teamA !== 0 || match.sets[setIndex].teamB !== 0 || isPresetGame || isEditing ? match.sets[setIndex].teamA : ''}
                  </button>
                </div>
              ))}
              
              <div className="flex items-center justify-center" style={{ gridColumn: '1', gridRow: '2' }}>
                {renderTeam('teamB')}
              </div>
              
              {match.sets.map((_, setIndex) => (
                <div key={`teamB-${setIndex}`} className="flex items-center justify-center" style={{
                  gridColumn: `${setIndex + 2}`,
                  gridRow: '2',
                  transform: 'translateY(-15%)'
                }}>
                  <button
                    onClick={() => onSetClick(setIndex)}
                    className={`text-2xl font-bold transition-colors ${
                      (isPresetGame || (!isPresetGame && isEditing)) && canEditResults
                        ? 'text-orange-500 hover:text-orange-600 cursor-pointer'
                        : 'text-gray-400 dark:text-gray-600 cursor-default'
                    }`}
                  >
                    {match.sets[setIndex].teamA !== 0 || match.sets[setIndex].teamB !== 0 || isPresetGame || isEditing ? match.sets[setIndex].teamB : ''}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <div className="grid gap-2 min-w-max" style={{
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

