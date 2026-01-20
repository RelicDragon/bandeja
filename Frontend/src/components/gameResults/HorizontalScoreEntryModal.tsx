import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser } from '@/types';
import { BaseModal } from '../BaseModal';

interface HorizontalScoreEntryModalProps {
  match: Match;
  setIndex: number;
  players: BasicUser[];
  maxTotalPointsPerSet?: number;
  maxPointsPerTeam?: number;
  fixedNumberOfSets?: number;
  onSave: (matchId: string, setIndex: number, teamAScore: number, teamBScore: number, isTieBreak?: boolean) => void;
  onRemove?: (matchId: string, setIndex: number) => void;
  onClose: () => void;
  canRemove?: boolean;
  isOpen: boolean;
}

export const HorizontalScoreEntryModal = ({
  match,
  setIndex,
  players,
  maxTotalPointsPerSet,
  maxPointsPerTeam,
  fixedNumberOfSets,
  onSave,
  onRemove,
  onClose,
  canRemove = false,
  isOpen,
}: HorizontalScoreEntryModalProps) => {
  const { t } = useTranslation();
  const currentSet = match.sets[setIndex] || { teamA: 0, teamB: 0, isTieBreak: false };
  const [teamAScore, setTeamAScore] = useState(currentSet.teamA);
  const [teamBScore, setTeamBScore] = useState(currentSet.teamB);
  const [numberPickerTeam, setNumberPickerTeam] = useState<'teamA' | 'teamB' | null>(null);

  useEffect(() => {
    setTeamAScore(currentSet.teamA);
    setTeamBScore(currentSet.teamB);
  }, [currentSet.teamA, currentSet.teamB]);

  const handleTeamAScoreChange = (newScore: number) => {
    const minScore = 0;
    const maxScore = maxTotalPointsPerSet && maxTotalPointsPerSet > 0 ? maxTotalPointsPerSet : 48;
    const clampedScore = Math.max(minScore, Math.min(newScore, maxScore));
    setTeamAScore(clampedScore);
    if (maxTotalPointsPerSet && maxTotalPointsPerSet > 0) {
      setTeamBScore(Math.max(0, maxTotalPointsPerSet - clampedScore));
    }
  };

  const handleTeamBScoreChange = (newScore: number) => {
    const minScore = 0;
    const maxScore = maxTotalPointsPerSet && maxTotalPointsPerSet > 0 ? maxTotalPointsPerSet : 48;
    const clampedScore = Math.max(minScore, Math.min(newScore, maxScore));
    setTeamBScore(clampedScore);
    if (maxTotalPointsPerSet && maxTotalPointsPerSet > 0) {
      setTeamAScore(Math.max(0, maxTotalPointsPerSet - clampedScore));
    }
  };

  const handleSave = () => {
    onSave(match.id, setIndex, teamAScore, teamBScore, false);
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
  const numberOptions = Array.from({ length: maxNumber + 1 }, (_, i) => i);

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

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose} 
      isBasic 
      modalId="horizontal-score-entry-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-primary-600/5 rounded-2xl sm:rounded-3xl pointer-events-none" />
      
      <div className="flex items-center justify-between mb-3 sm:mb-5 md:mb-8 p-3 sm:p-6 md:p-8">
        <div>
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
            {fixedNumberOfSets === 1 ? t('gameResults.matchResult') : t('gameResults.setResult')}
          </h3>
        </div>
      </div>
      
      <div className="relative mb-3 sm:mb-5 md:mb-8 px-3 sm:px-6 md:px-8">
        <div className={`transition-all duration-500 ${!isNumberPickerMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
              <div className="flex flex-row items-center gap-3 sm:gap-6 md:gap-8">
                <div className="flex-1 flex flex-col items-center gap-4 sm:gap-5 md:gap-6 w-full">
                  <div className="relative">
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
                  <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={() => handleTeamAScoreChange(teamAScore + 1)}
                      disabled={!!(maxTotalPointsPerSet && maxTotalPointsPerSet > 0 && teamAScore >= maxTotalPointsPerSet)}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <ChevronUp className="w-5 h-5 sm:w-6 sm:h-6" />
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
                      onClick={() => handleTeamAScoreChange(Math.max(0, teamAScore - 1))}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                    >
                      <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>
                </div>

                <div className="relative flex items-center justify-center flex-shrink-0">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary-500/20 via-transparent to-primary-500/20 blur-sm" />
                  <div className="relative w-0.5 h-full min-h-[200px] sm:min-h-[240px] md:min-h-[280px] bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-500 dark:to-gray-600 text-white flex items-center justify-center text-[10px] sm:text-xs font-bold shadow-lg">
                    VS
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center gap-4 sm:gap-5 md:gap-6 w-full">
                  <div className="relative">
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
                  <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={() => handleTeamBScoreChange(teamBScore + 1)}
                      disabled={!!(maxTotalPointsPerSet && maxTotalPointsPerSet > 0 && teamBScore >= maxTotalPointsPerSet)}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <ChevronUp className="w-5 h-5 sm:w-6 sm:h-6" />
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
                      onClick={() => handleTeamBScoreChange(Math.max(0, teamBScore - 1))}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                    >
                      <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6" />
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
      
      <div className="flex gap-2 sm:gap-3 pt-8 px-3 sm:px-6 md:px-8 pb-3 sm:pb-6 md:pb-8">
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
          className="flex-1 h-10 sm:h-11 md:h-12 rounded-xl font-semibold bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 text-sm sm:text-base"
        >
          {t('common.save')}
        </Button>
      </div>
    </BaseModal>
  );
};

