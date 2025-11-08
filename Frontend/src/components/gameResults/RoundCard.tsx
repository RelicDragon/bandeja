import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Trash2, Plus } from 'lucide-react';
import { Round } from '@/types/gameResults';
import { User, Court } from '@/types';
import { MatchCard } from './MatchCard';
import { HorizontalMatchCard } from './HorizontalMatchCard';
import { ConfirmationModal } from '@/components';

interface RoundCardProps {
  round: Round;
  players: User[];
  isPresetGame: boolean;
  isExpanded: boolean;
  canEditResults: boolean;
  editingMatchId: string | null;
  draggedPlayer: string | null;
  showDeleteButton: boolean;
  onRemoveRound: () => void;
  onToggleExpand: () => void;
  onAddMatch: () => void;
  onRemoveMatch: (matchId: string) => void;
  onMatchClick: (matchId: string) => void;
  onSetClick: (matchId: string, setIndex: number) => void;
  onRemovePlayer: (matchId: string, team: 'teamA' | 'teamB', playerId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, matchId: string, team: 'teamA' | 'teamB') => void;
  onPlayerPlaceholderClick: (matchId: string, team: 'teamA' | 'teamB') => void;
  canEnterResults: (matchId: string) => boolean;
  showCourtLabel?: boolean;
  courts?: Court[];
  onCourtClick?: (matchId: string) => void;
  fixedNumberOfSets?: number;
  prohibitMatchesEditing?: boolean;
}

export const RoundCard = ({
  round,
  players,
  isPresetGame,
  isExpanded,
  canEditResults,
  editingMatchId,
  draggedPlayer,
  showDeleteButton,
  onRemoveRound,
  onToggleExpand,
  onAddMatch,
  onRemoveMatch,
  onMatchClick,
  onSetClick,
  onRemovePlayer,
  onDragOver,
  onDrop,
  onPlayerPlaceholderClick,
  canEnterResults,
  showCourtLabel = false,
  courts = [],
  onCourtClick,
  fixedNumberOfSets,
  prohibitMatchesEditing = false,
}: RoundCardProps) => {
  const { t } = useTranslation();
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  return (
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg border-2 shadow-sm ${
          isExpanded ? 'border-blue-500 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'
        } transition-colors`}
      >
        <div
          className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronDown size={16} className="text-gray-600 dark:text-gray-400" />
            ) : (
              <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
            )}
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              {round.name}
            </h3>
          </div>

          {showDeleteButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirmation(true);
              }}
              className="w-8 h-8 rounded-full border-2 border-red-500 hover:border-red-600 bg-white dark:bg-gray-800 text-red-500 hover:text-red-600 flex items-center justify-center transition-colors shadow-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            <div className="p-2">
              {round.matches.map((match, matchIndex) => (
                fixedNumberOfSets === 1 ? (
                  <HorizontalMatchCard
                    key={match.id}
                    match={match}
                    matchIndex={matchIndex}
                    players={players}
                    isPresetGame={isPresetGame}
                    isEditing={editingMatchId === match.id}
                    canEditResults={canEditResults}
                    draggedPlayer={draggedPlayer}
                    showDeleteButton={round.matches.length > 1 && !isPresetGame && editingMatchId === match.id && canEditResults && !prohibitMatchesEditing}
                    onRemoveMatch={() => onRemoveMatch(match.id)}
                    onMatchClick={() => onMatchClick(match.id)}
                    onSetClick={(setIndex) => onSetClick(match.id, setIndex)}
                    onRemovePlayer={(team, playerId) => onRemovePlayer(match.id, team, playerId)}
                    onDragOver={onDragOver}
                    onDrop={(e, team) => onDrop(e, match.id, team)}
                    onPlayerPlaceholderClick={(team) => onPlayerPlaceholderClick(match.id, team)}
                    canEnterResults={canEnterResults(match.id)}
                    showCourtLabel={showCourtLabel}
                    selectedCourt={courts?.find(c => c.id === match.courtId) || null}
                    courts={courts}
                    onCourtClick={() => onCourtClick && onCourtClick(match.id)}
                    fixedNumberOfSets={fixedNumberOfSets}
                    prohibitMatchesEditing={prohibitMatchesEditing}
                  />
                ) : (
                  <MatchCard
                    key={match.id}
                    match={match}
                    matchIndex={matchIndex}
                    players={players}
                    isPresetGame={isPresetGame}
                    isEditing={editingMatchId === match.id}
                    canEditResults={canEditResults}
                    draggedPlayer={draggedPlayer}
                    showDeleteButton={round.matches.length > 1 && !isPresetGame && editingMatchId === match.id && canEditResults && !prohibitMatchesEditing}
                    onRemoveMatch={() => onRemoveMatch(match.id)}
                    onMatchClick={() => onMatchClick(match.id)}
                    onSetClick={(setIndex) => onSetClick(match.id, setIndex)}
                    onRemovePlayer={(team, playerId) => onRemovePlayer(match.id, team, playerId)}
                    onDragOver={onDragOver}
                    onDrop={(e, team) => onDrop(e, match.id, team)}
                    onPlayerPlaceholderClick={(team) => onPlayerPlaceholderClick(match.id, team)}
                    canEnterResults={canEnterResults(match.id)}
                    showCourtLabel={showCourtLabel}
                    selectedCourt={courts?.find(c => c.id === match.courtId) || null}
                    courts={courts}
                    onCourtClick={() => onCourtClick && onCourtClick(match.id)}
                    fixedNumberOfSets={fixedNumberOfSets}
                    prohibitMatchesEditing={prohibitMatchesEditing}
                  />
                )
              ))}

              {!isPresetGame && !prohibitMatchesEditing && editingMatchId && canEditResults && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddMatch();
                    }}
                    className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors shadow-lg"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showDeleteConfirmation && (
          <ConfirmationModal
            isOpen={showDeleteConfirmation}
            title={t('gameResults.deleteRound')}
            message={t('gameResults.deleteRoundConfirmation')}
            highlightedText={round.name}
            confirmText={t('common.delete')}
            cancelText={t('common.cancel')}
            confirmVariant="danger"
            onConfirm={onRemoveRound}
            onClose={() => setShowDeleteConfirmation(false)}
          />
        )}
      </div>
  );
};

