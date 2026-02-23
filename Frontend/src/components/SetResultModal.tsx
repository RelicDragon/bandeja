import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Minus, Plus, Zap, X } from 'lucide-react';
import { Button } from '@/components';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogClose } from '@/components/ui/Dialog';
import { isLastSet, validateTieBreak } from '@/utils/gameResults';

interface SetResultModalProps {
  match: Match;
  setIndex: number;
  players: BasicUser[];
  courtLabel?: string | null;
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
  courtLabel,
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
    <Dialog open={isOpen} onClose={onClose} modalId="set-result-modal">
      <DialogContent showCloseButton={false} className="overflow-visible">
      <DialogClose asChild>
        <button
          type="button"
          aria-label="Close"
          className="absolute left-[calc(100%+0.5rem)] top-4 z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-105 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 [&>svg]:size-5"
        >
          <X />
        </button>
      </DialogClose>
      <div className="overflow-hidden rounded-xl flex flex-row flex-1 min-h-0">
      {courtLabel != null && courtLabel !== '' && (
        <div className="relative flex items-center justify-center w-7 sm:w-8 flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <span className="absolute [writing-mode:vertical-lr] rotate-180 text-[10px] sm:text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap select-none">
            {courtLabel}
          </span>
        </div>
      )}
      <div className="flex flex-col flex-1 min-w-0">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-primary-600/5 rounded-2xl sm:rounded-3xl pointer-events-none" />

      <div className="relative py-4 px-3 sm:px-4">
        <div className={`transition-all duration-500 ${!isNumberPickerMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
              <div className="flex flex-col items-center gap-2 sm:gap-3">
                <div className="w-full flex flex-row items-center gap-2 sm:gap-3">
                  <div className="flex-1 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-primary-600/10 rounded-lg sm:rounded-xl blur-md" />
                    <div className={`relative flex flex-wrap justify-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 backdrop-blur-sm rounded-lg sm:rounded-xl border transition-colors duration-200 ${
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
                  <div className="flex flex-row items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={() => handleTeamAScoreChange(Math.max(0, teamAScore - 1))}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-200 shadow hover:scale-105 active:scale-95"
                    >
                      <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                      onClick={() => setNumberPickerTeam('teamA')}
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg sm:rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-md" />
                      <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-lg sm:rounded-xl border-2 border-gray-200 dark:border-gray-700 group-hover:border-primary-500 transition-all duration-200 shadow group-hover:scale-105 active:scale-95">
                        <span className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                          {teamAScore}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTeamAScoreChange(teamAScore + 1)}
                      disabled={!!(maxTotalPointsPerSet && maxTotalPointsPerSet > 0 && teamAScore >= maxTotalPointsPerSet)}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>

                <div className="relative flex items-center justify-center flex-shrink-0 w-full">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 via-transparent to-primary-500/20 blur-sm" />
                  <div className="relative w-full h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-500 dark:to-gray-600 text-white flex items-center justify-center text-[10px] font-bold shadow">
                    VS
                  </div>
                </div>

                <div className="w-full flex flex-row items-center gap-2 sm:gap-3">
                  <div className="flex-1 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 to-primary-500/10 rounded-lg sm:rounded-xl blur-md" />
                    <div className={`relative flex flex-wrap justify-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 backdrop-blur-sm rounded-lg sm:rounded-xl border transition-colors duration-200 ${
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
                  <div className="flex flex-row items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={() => handleTeamBScoreChange(Math.max(0, teamBScore - 1))}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-200 shadow hover:scale-105 active:scale-95"
                    >
                      <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                      onClick={() => setNumberPickerTeam('teamB')}
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg sm:rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-md" />
                      <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-lg sm:rounded-xl border-2 border-gray-200 dark:border-gray-700 group-hover:border-primary-500 transition-all duration-200 shadow group-hover:scale-105 active:scale-95">
                        <span className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                          {teamBScore}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTeamBScoreChange(teamBScore + 1)}
                      disabled={!!(maxTotalPointsPerSet && maxTotalPointsPerSet > 0 && teamBScore >= maxTotalPointsPerSet)}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              </div>
        </div>
        
        <div className={`transition-all duration-500 ${isNumberPickerMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
              <div className="flex flex-col items-center gap-2 sm:gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-primary-600/10 rounded-lg sm:rounded-xl blur-md" />
                  <div className="relative flex flex-wrap justify-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg sm:rounded-xl border border-gray-200/50 dark:border-gray-700/50">
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
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 sm:gap-1.5 w-full max-w-xs sm:max-w-sm px-0">
                  {numberOptions.map((number) => (
                    <button
                      key={number}
                      onClick={() => handleNumberSelect(number)}
                      className={`aspect-square rounded-md sm:rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 ${
                        number === currentScore
                          ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/40 scale-105 ring-2 ring-primary-400 ring-offset-1 dark:ring-offset-gray-900'
                          : 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-105 active:scale-95 shadow border border-gray-200 dark:border-gray-700'
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
        <div className="px-3 sm:px-4 pb-2">
          <div className="flex items-center justify-center gap-2 p-2 sm:p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <Zap 
                className={`w-4 h-4 transition-colors duration-300 ${
                  isTieBreak 
                    ? 'text-yellow-500 dark:text-yellow-400' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('gameResults.tieBreak') || 'TieBreak'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isTieBreak}
                onClick={() => setIsTieBreak(!isTieBreak)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  isTieBreak
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${
                    isTieBreak ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      )}
      
      <DialogFooter className="flex gap-2 pt-2 px-3 sm:px-4 pb-3">
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1 h-9 sm:h-10 rounded-lg font-semibold hover:scale-105 active:scale-95 transition-all duration-200 text-sm"
        >
          {t('common.cancel')}
        </Button>
        {canRemove && onRemove && (
          <Button
            onClick={handleRemove}
            variant="outline"
            className="px-3 h-9 sm:h-10 rounded-lg text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20 hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <Trash2 size={14} className="sm:w-4 sm:h-4" />
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={isTieBreak && teamAScore === teamBScore}
          className="flex-1 h-9 sm:h-10 rounded-lg font-semibold bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow hover:scale-105 active:scale-95 transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {t('common.save')}
        </Button>
      </DialogFooter>
      </div>
      </div>
      </DialogContent>
    </Dialog>
  );
};
