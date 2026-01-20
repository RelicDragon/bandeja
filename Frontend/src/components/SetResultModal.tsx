import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Minus, Plus, Zap } from 'lucide-react';
import { Button } from '@/components';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser } from '@/types';
import { BaseModal } from './BaseModal';
import { isLastSet, validateTieBreak } from '@/utils/gameResults';

interface SetResultModalProps {
  match: Match;
  setIndex: number;
  players: BasicUser[];
  maxTotalPointsPerSet?: number;
  maxPointsPerTeam?: number;
  fixedNumberOfSets?: number;
  ballsInGames?: boolean;
  onSave: (matchId: string, setIndex: number, teamAScore: number, teamBScore: number, isTieBreak?: boolean) => void;
  onRemove?: (matchId: string, setIndex: number) => void;
  onClose: () => void;
  canRemove?: boolean;
  isOpen: boolean;
}

export const SetResultModal = ({
  match,
  setIndex,
  players,
  maxTotalPointsPerSet,
  maxPointsPerTeam,
  fixedNumberOfSets,
  ballsInGames = false,
  onSave,
  onRemove,
  onClose,
  canRemove = false,
  isOpen,
}: SetResultModalProps) => {
  const { t } = useTranslation();
  const currentSet = match.sets[setIndex] || { teamA: 0, teamB: 0, isTieBreak: false };
  const [teamAScore, setTeamAScore] = useState(currentSet.teamA);
  const [teamBScore, setTeamBScore] = useState(currentSet.teamB);
  const [isTieBreak, setIsTieBreak] = useState(currentSet.isTieBreak || false);
  const [numberPickerTeam, setNumberPickerTeam] = useState<'teamA' | 'teamB' | null>(null);
  const prevIsTieBreakRef = useRef(isTieBreak);

  useEffect(() => {
    setTeamAScore(currentSet.teamA);
    setTeamBScore(currentSet.teamB);
    const newIsTieBreak = currentSet.isTieBreak || false;
    setIsTieBreak(newIsTieBreak);
    prevIsTieBreakRef.current = newIsTieBreak;
  }, [currentSet.teamA, currentSet.teamB, currentSet.isTieBreak]);

  // Prevent equal scores when tiebreak is enabled
  useEffect(() => {
    // Only adjust when tiebreak is toggled ON (not when it's already on)
    if (isTieBreak && !prevIsTieBreakRef.current && teamAScore === teamBScore && teamAScore > 0) {
      // Adjust teamA score by 1 to make them different
      setTeamAScore(teamAScore + 1);
    }
    prevIsTieBreakRef.current = isTieBreak;
  }, [isTieBreak, teamAScore, teamBScore]);

  const handleTeamAScoreChange = (newScore: number) => {
    const minScore = 0;
    const maxScore = maxTotalPointsPerSet && maxTotalPointsPerSet > 0 ? maxTotalPointsPerSet : 48;
    let clampedScore = Math.max(minScore, Math.min(newScore, maxScore));
    
    // Prevent equal scores in tiebreak
    if (isTieBreak && clampedScore === teamBScore) {
      // If trying to set equal score, adjust by 1
      if (clampedScore < maxScore) {
        clampedScore = clampedScore + 1;
      } else if (clampedScore > 0) {
        clampedScore = clampedScore - 1;
      } else {
        return; // Cannot adjust, skip
      }
    }
    
    setTeamAScore(clampedScore);
    
    if (maxTotalPointsPerSet && maxTotalPointsPerSet > 0) {
      let newTeamBScore = Math.max(0, maxTotalPointsPerSet - clampedScore);
      // Prevent equal scores in tiebreak
      if (isTieBreak && newTeamBScore === clampedScore) {
        if (newTeamBScore > 0) {
          newTeamBScore = newTeamBScore - 1;
        } else {
          // Adjust teamA instead
          setTeamAScore(clampedScore - 1);
          return;
        }
      }
      setTeamBScore(newTeamBScore);
    }
  };

  const handleTeamBScoreChange = (newScore: number) => {
    const minScore = 0;
    const maxScore = maxTotalPointsPerSet && maxTotalPointsPerSet > 0 ? maxTotalPointsPerSet : 48;
    let clampedScore = Math.max(minScore, Math.min(newScore, maxScore));
    
    // Prevent equal scores in tiebreak
    if (isTieBreak && clampedScore === teamAScore) {
      // If trying to set equal score, adjust by 1
      if (clampedScore < maxScore) {
        clampedScore = clampedScore + 1;
      } else if (clampedScore > 0) {
        clampedScore = clampedScore - 1;
      } else {
        return; // Cannot adjust, skip
      }
    }
    
    setTeamBScore(clampedScore);
    
    if (maxTotalPointsPerSet && maxTotalPointsPerSet > 0) {
      let newTeamAScore = Math.max(0, maxTotalPointsPerSet - clampedScore);
      // Prevent equal scores in tiebreak
      if (isTieBreak && newTeamAScore === clampedScore) {
        if (newTeamAScore > 0) {
          newTeamAScore = newTeamAScore - 1;
        } else {
          // Adjust teamB instead
          setTeamBScore(clampedScore - 1);
          return;
        }
      }
      setTeamAScore(newTeamAScore);
    }
  };

  const handleSave = () => {
    const setBeingUpdated = { teamA: teamAScore, teamB: teamBScore, isTieBreak };
    const lastSetCheck = isLastSet(setIndex, match.sets, fixedNumberOfSets || 0, setBeingUpdated);
    
    const finalIsTieBreak = showTieBreakToggle && lastSetCheck ? isTieBreak : false;
    
    // Validate that tiebreak sets cannot have equal scores
    if (finalIsTieBreak && teamAScore === teamBScore) {
      console.error('TieBreak sets cannot have equal scores');
      return;
    }
    
    const tieBreakError = validateTieBreak(
      setIndex,
      match.sets,
      fixedNumberOfSets || 0,
      finalIsTieBreak,
      ballsInGames,
      setBeingUpdated
    );

    if (tieBreakError) {
      console.error('TieBreak validation error:', tieBreakError);
      return;
    }

    onSave(match.id, setIndex, teamAScore, teamBScore, finalIsTieBreak);
    onClose();
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove(match.id, setIndex);
      onClose();
    }
  };

  const teamAPlayers = match.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as BasicUser[];
  const teamBPlayers = match.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as BasicUser[];

  const maxNumber = Math.min(
    maxTotalPointsPerSet && maxTotalPointsPerSet > 0 ? maxTotalPointsPerSet : 32,
    maxPointsPerTeam && maxPointsPerTeam > 0 ? maxPointsPerTeam : 32,
    32
  );
  
  // Filter out options that would result in equal scores when tiebreak is enabled
  const numberOptions = Array.from({ length: maxNumber + 1 }, (_, i) => i).filter((number) => {
    if (!isTieBreak) return true;
    if (numberPickerTeam === 'teamA') {
      return number !== teamBScore;
    } else if (numberPickerTeam === 'teamB') {
      return number !== teamAScore;
    }
    return true;
  });

  const handleNumberSelect = (number: number) => {
    if (numberPickerTeam === 'teamA') {
      handleTeamAScoreChange(number);
    } else if (numberPickerTeam === 'teamB') {
      handleTeamBScoreChange(number);
    }
    setNumberPickerTeam(null);
  };

  const isNumberPickerMode = numberPickerTeam !== null;
  const selectedTeamPlayers = numberPickerTeam === 'teamA' ? teamAPlayers : numberPickerTeam === 'teamB' ? teamBPlayers : [];
  const currentScore = numberPickerTeam === 'teamA' ? teamAScore : numberPickerTeam === 'teamB' ? teamBScore : 0;
  const isTeamAWinning = teamAScore > teamBScore;
  const isTeamBWinning = teamBScore > teamAScore;
  
  const setBeingUpdated = { teamA: teamAScore, teamB: teamBScore, isTieBreak };
  const lastSetCheck = isLastSet(setIndex, match.sets, fixedNumberOfSets || 0, setBeingUpdated);
  const hasExistingTieBreak = match.sets.some((set, idx) => idx !== setIndex && set.isTieBreak);
  
  // Check if this is an odd set starting from 3rd (setIndex 2, 4, 6, 8)
  const isOddSetFromThird = setIndex >= 2 && (setIndex - 2) % 2 === 0;
  
  // Check if previous sets are equally won by both teams
  const arePreviousSetsTied = () => {
    if (setIndex < 2) return false;
    
    let teamAWins = 0;
    let teamBWins = 0;
    
    for (let i = 0; i < setIndex; i++) {
      const set = match.sets[i];
      if (set && (set.teamA > 0 || set.teamB > 0)) {
        if (set.teamA > set.teamB) {
          teamAWins++;
        } else if (set.teamB > set.teamA) {
          teamBWins++;
        }
      }
    }
    
    return teamAWins === teamBWins;
  };
  
  const showTieBreakToggle = isOddSetFromThird && arePreviousSetsTied() && lastSetCheck && ballsInGames && !hasExistingTieBreak;

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose} 
      isBasic 
      modalId="set-result-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-primary-600/5 rounded-2xl sm:rounded-3xl pointer-events-none" />
      
      <div className="flex items-center justify-between mb-3 sm:mb-5 md:mb-8 p-3 sm:p-4 md:p-5">
        <div>
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
            {fixedNumberOfSets === 1 ? t('gameResults.matchResult') : t('gameResults.setResult')}
          </h3>
        </div>
      </div>
      
      <div className="relative mb-3 sm:mb-5 md:mb-8 px-3 sm:px-4 md:px-5">
        <div className={`transition-all duration-500 ${!isNumberPickerMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
              <div className="flex flex-col items-center gap-4 sm:gap-6 md:gap-8">
                <div className="w-full flex flex-row items-center gap-3 sm:gap-4 md:gap-6">
                  <div className="flex-1 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-primary-600/10 rounded-xl sm:rounded-2xl blur-lg sm:blur-xl" />
                    <div className={`relative flex flex-wrap justify-center gap-1.5 sm:gap-2 md:gap-3 p-2 sm:p-3 md:p-4 backdrop-blur-sm rounded-xl sm:rounded-2xl border transition-colors duration-200 ${
                      isTeamAWinning 
                        ? 'bg-yellow-100/90 dark:bg-yellow-900/40 border-yellow-300/50 dark:border-yellow-700/50' 
                        : 'bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50'
                    }`}>
                      {teamAPlayers.map(player => (
                        <PlayerAvatar
                          key={player.id}
                          player={player}
                          showName={true}
                          extrasmall={true}
                          draggable={false}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-row items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => handleTeamAScoreChange(Math.max(0, teamAScore - 1))}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                    >
                      <Minus className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button
                      onClick={() => setNumberPickerTeam('teamA')}
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg sm:blur-xl" />
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 flex items-center justify-center bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl sm:rounded-2xl border-2 border-gray-200 dark:border-gray-700 group-hover:border-primary-500 transition-all duration-200 shadow-lg group-hover:shadow-2xl group-hover:scale-105 active:scale-95">
                        <span className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-br from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                          {teamAScore}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTeamAScoreChange(teamAScore + 1)}
                      disabled={!!(maxTotalPointsPerSet && maxTotalPointsPerSet > 0 && teamAScore >= maxTotalPointsPerSet)}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>
                </div>

                <div className="relative flex items-center justify-center flex-shrink-0 w-full">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 via-transparent to-primary-500/20 blur-sm" />
                  <div className="relative w-full h-0.5 bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-500 dark:to-gray-600 text-white flex items-center justify-center text-[10px] sm:text-xs font-bold shadow-lg">
                    VS
                  </div>
                </div>

                <div className="w-full flex flex-row items-center gap-3 sm:gap-4 md:gap-6">
                  <div className="flex-1 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 to-primary-500/10 rounded-xl sm:rounded-2xl blur-lg sm:blur-xl" />
                    <div className={`relative flex flex-wrap justify-center gap-1.5 sm:gap-2 md:gap-3 p-2 sm:p-3 md:p-4 backdrop-blur-sm rounded-xl sm:rounded-2xl border transition-colors duration-200 ${
                      isTeamBWinning 
                        ? 'bg-yellow-100/90 dark:bg-yellow-900/40 border-yellow-300/50 dark:border-yellow-700/50' 
                        : 'bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50'
                    }`}>
                      {teamBPlayers.map(player => (
                        <PlayerAvatar
                          key={player.id}
                          player={player}
                          showName={true}
                          extrasmall={true}
                          draggable={false}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-row items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => handleTeamBScoreChange(Math.max(0, teamBScore - 1))}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                    >
                      <Minus className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button
                      onClick={() => setNumberPickerTeam('teamB')}
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg sm:blur-xl" />
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 flex items-center justify-center bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl sm:rounded-2xl border-2 border-gray-200 dark:border-gray-700 group-hover:border-primary-500 transition-all duration-200 shadow-lg group-hover:shadow-2xl group-hover:scale-105 active:scale-95">
                        <span className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-br from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                          {teamBScore}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTeamBScoreChange(teamBScore + 1)}
                      disabled={!!(maxTotalPointsPerSet && maxTotalPointsPerSet > 0 && teamBScore >= maxTotalPointsPerSet)}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>
                </div>
              </div>
        </div>
        
        <div className={`transition-all duration-500 ${isNumberPickerMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
              <div className="flex flex-col items-center gap-3 sm:gap-5 md:gap-8">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-primary-600/10 rounded-xl sm:rounded-2xl blur-lg sm:blur-xl" />
                  <div className="relative flex flex-wrap justify-center gap-1.5 sm:gap-2 md:gap-3 p-2 sm:p-3 md:p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
                    {selectedTeamPlayers.map(player => (
                      <PlayerAvatar
                        key={player.id}
                        player={player}
                        showName={true}
                        extrasmall={true}
                        draggable={false}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 sm:gap-2 md:gap-2.5 w-full max-w-xs sm:max-w-md px-1">
                  {numberOptions.map((number) => (
                    <button
                      key={number}
                      onClick={() => handleNumberSelect(number)}
                      className={`aspect-square rounded-lg sm:rounded-xl font-bold text-sm sm:text-base transition-all duration-200 ${
                        number === currentScore
                          ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 scale-110 ring-2 ring-primary-400 ring-offset-1 sm:ring-offset-2 dark:ring-offset-gray-900'
                          : 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-110 active:scale-95 shadow-md hover:shadow-lg border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {number}
                    </button>
                  ))}
                </div>
              </div>
        </div>
      </div>
      
      {showTieBreakToggle && (
        <div className="px-3 sm:px-4 md:px-5 pb-3 sm:pb-4 md:pb-5">
          <div className="flex items-center justify-center gap-3 p-3 sm:p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <Zap 
                className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors duration-300 ${
                  isTieBreak 
                    ? 'text-yellow-500 dark:text-yellow-400' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              />
              <span className="text-sm sm:text-base font-medium text-gray-700 dark:text-gray-300">
                {t('gameResults.tieBreak') || 'TieBreak'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isTieBreak}
                onClick={() => setIsTieBreak(!isTieBreak)}
                className={`relative inline-flex h-6 w-11 sm:h-7 sm:w-12 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  isTieBreak
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 sm:h-5 sm:w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
                    isTieBreak ? 'translate-x-6 sm:translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      )}
      
      <div className="flex gap-2 sm:gap-3 pt-4 px-3 sm:px-4 md:px-5 pb-3 sm:pb-4 md:pb-5">
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1 h-10 sm:h-11 md:h-12 rounded-xl font-semibold hover:scale-105 active:scale-95 transition-all duration-200 text-sm sm:text-base"
        >
          {t('common.cancel')}
        </Button>
        {canRemove && onRemove && (
          <Button
            onClick={handleRemove}
            variant="outline"
            className="px-3 sm:px-4 h-10 sm:h-11 md:h-12 rounded-xl text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20 hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" />
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={isTieBreak && teamAScore === teamBScore}
          className="flex-1 h-10 sm:h-11 md:h-12 rounded-xl font-semibold bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {t('common.save')}
        </Button>
      </div>
    </BaseModal>
  );
};
