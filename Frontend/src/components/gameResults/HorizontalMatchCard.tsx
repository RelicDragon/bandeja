import { Trash2, MapPin } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { User, Court } from '@/types';

interface HorizontalMatchCardProps {
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
    ? Array.from({ length: fixedNumberOfSets }, (_, i) => match.sets[i] || { teamA: 0, teamB: 0 })
    : (() => {
        const sets = [...match.sets];
        if (sets.length > 0) {
          const lastSet = sets[sets.length - 1];
          if (lastSet.teamA > 0 || lastSet.teamB > 0) {
            sets.push({ teamA: 0, teamB: 0 });
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
        className={`min-h-[40px] p-2 w-full flex items-center justify-center relative ${
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
                  removable={!effectiveIsPresetGame && effectiveIsEditing && canEditResults}
                  onRemoveClick={!effectiveIsPresetGame && effectiveIsEditing && canEditResults ? () => onRemovePlayer(team, playerId) : undefined}
                />
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
            if (onCourtClick) {
              onCourtClick();
            }
          }}
          className="absolute -top-1 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
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
        <div className="flex items-center justify-between w-full gap-4">
          <div className="flex-1 flex justify-start">
            {renderTeam('teamA')}
          </div>
          
          {canEnterResults && (
            <div className="flex items-center gap-2">
              {displaySets.map((set, setIndex) => (
                <button
                  key={setIndex}
                  onClick={(effectiveIsPresetGame || (!effectiveIsPresetGame && effectiveIsEditing)) && canEditResults ? (e) => {
                    e.stopPropagation();
                    onSetClick(setIndex);
                  } : undefined}
                  className={`text-2xl font-bold transition-colors ${
                    (effectiveIsPresetGame || (!effectiveIsPresetGame && effectiveIsEditing)) && canEditResults
                      ? 'text-orange-500 hover:text-orange-600 cursor-pointer'
                      : 'text-gray-400 dark:text-gray-600 cursor-default'
                  }`}
                >
                  {set.teamA !== 0 || set.teamB !== 0 || effectiveIsPresetGame || effectiveIsEditing || (fixedNumberOfSets && fixedNumberOfSets > 0)
                    ? `${set.teamA} : ${set.teamB}` 
                    : ''}
                </button>
              ))}
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

