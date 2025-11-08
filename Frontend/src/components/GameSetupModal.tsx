import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { EntityType, WinnerOfGame, WinnerOfRound, WinnerOfMatch, MatchGenerationType } from '@/types';

interface GameSetupModalProps {
  isOpen: boolean;
  entityType: EntityType;
  hasMultiRounds?: boolean;
  isEditing?: boolean;
  confirmButtonText?: string;
  initialValues?: {
    fixedNumberOfSets?: number;
    maxTotalPointsPerSet?: number;
    maxPointsPerTeam?: number;
    winnerOfGame?: WinnerOfGame;
    winnerOfRound?: WinnerOfRound;
    winnerOfMatch?: WinnerOfMatch;
    matchGenerationType?: MatchGenerationType;
    prohibitMatchesEditing?: boolean;
  };
  onClose: () => void;
  onConfirm: (params: {
    fixedNumberOfSets: number;
    maxTotalPointsPerSet: number;
    maxPointsPerTeam: number;
    winnerOfGame: WinnerOfGame;
    winnerOfRound: WinnerOfRound;
    winnerOfMatch: WinnerOfMatch;
    matchGenerationType: MatchGenerationType;
    prohibitMatchesEditing?: boolean;
  }) => void;
}

export const GameSetupModal = ({ 
  isOpen, 
  entityType, 
  hasMultiRounds = true, 
  isEditing = true,
  confirmButtonText,
  initialValues,
  onClose, 
  onConfirm 
}: GameSetupModalProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'winner' | 'matches'>('general');
  const [fixedNumberOfSets, setFixedNumberOfSets] = useState(initialValues?.fixedNumberOfSets ?? 0);
  const [maxTotalPointsPerSet, setMaxTotalPointsPerSet] = useState(initialValues?.maxTotalPointsPerSet ?? 0);
  const [maxPointsPerTeam, setMaxPointsPerTeam] = useState(initialValues?.maxPointsPerTeam ?? 0);
  const [customSetPoints, setCustomSetPoints] = useState('');
  const [customTeamPoints, setCustomTeamPoints] = useState('');
  const [winnerOfGame, setWinnerOfGame] = useState<WinnerOfGame>(
    initialValues?.winnerOfGame ?? (hasMultiRounds ? 'BY_ROUNDS_WON' : 'BY_MATCHES_WON')
  );
  const [winnerOfRound, setWinnerOfRound] = useState<WinnerOfRound>(
    initialValues?.winnerOfRound ?? 'BY_MATCHES_WON'
  );
  const [winnerOfMatch, setWinnerOfMatch] = useState<WinnerOfMatch>(
    initialValues?.winnerOfMatch ?? 'BY_SCORES'
  );
  const [matchGenerationType, setMatchGenerationType] = useState<MatchGenerationType>(
    initialValues?.matchGenerationType ?? 'HANDMADE'
  );
  const [prohibitMatchesEditing, setProhibitMatchesEditing] = useState<boolean>(
    initialValues?.prohibitMatchesEditing ?? false
  );
  const [isAnimating, setIsAnimating] = useState(false);

  const SET_PRESETS = [16, 21, 24, 32];
  const TEAM_PRESETS = [7, 15, 20];

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (matchGenerationType === 'HANDMADE' || matchGenerationType === 'FIXED') {
      setProhibitMatchesEditing(false);
    }
  }, [matchGenerationType]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleConfirm = () => {
    onConfirm({
      fixedNumberOfSets,
      maxTotalPointsPerSet,
      maxPointsPerTeam,
      winnerOfGame,
      winnerOfRound,
      winnerOfMatch,
      matchGenerationType,
      prohibitMatchesEditing: matchGenerationType !== 'HANDMADE' && matchGenerationType !== 'FIXED' ? prohibitMatchesEditing : false,
    });
    handleClose();
  };

  const handleCustomSetPoints = (value: string) => {
    setCustomSetPoints(value);
    const num = parseInt(value);
    if (!isNaN(num) && num > 0 && num <= 100) {
      setMaxTotalPointsPerSet(num);
    } else if (value === '') {
      setMaxTotalPointsPerSet(0);
    }
  };

  const handleCustomTeamPoints = (value: string) => {
    setCustomTeamPoints(value);
    const num = parseInt(value);
    if (!isNaN(num) && num > 0 && num <= 50) {
      setMaxPointsPerTeam(num);
    } else if (value === '') {
      setMaxPointsPerTeam(0);
    }
  };

  const handleSetPresetClick = (num: number) => {
    setMaxTotalPointsPerSet(num);
    setCustomSetPoints('');
  };

  const handleTeamPresetClick = (num: number) => {
    setMaxPointsPerTeam(num);
    setCustomTeamPoints('');
  };

  const handleFixedNumberOfSetsChange = (num: number) => {
    setFixedNumberOfSets(num);
    if (num === 1) {
      setWinnerOfMatch('BY_SCORES');
    }
  };

  const getStartText = () => {
    if (confirmButtonText) return confirmButtonText;
    const entityTypeLower = entityType.toLowerCase();
    if (entityTypeLower === 'tournament') return t('gameResults.startTournament');
    if (entityTypeLower === 'bar') return t('gameResults.startBar');
    if (entityTypeLower === 'training') return t('gameResults.startTraining');
    return t('gameResults.startGame');
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300"
      style={{
        opacity: isAnimating ? 1 : 0,
        pointerEvents: 'auto',
      }}
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full mx-4 transform transition-all duration-300 border border-gray-200 dark:border-gray-700"
        style={{
          transform: isAnimating ? 'scale(1)' : 'scale(0.95)',
          opacity: isAnimating ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent">
              {t('gameResults.setupGame')}
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all hover:rotate-90 duration-300 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('general')}
                className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 border-b-2 ${
                  activeTab === 'general'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('gameResults.general')}
              </button>
              <button
                onClick={() => setActiveTab('winner')}
                className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 border-b-2 ${
                  activeTab === 'winner'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('gameResults.winner')}
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 border-b-2 ${
                  activeTab === 'matches'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('gameResults.matches')}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {activeTab === 'general' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {t('gameResults.fixedNumberOfSets')}
                  </label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFixedNumberOfSetsChange(0)}
                  disabled={!isEditing}
                  className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                    fixedNumberOfSets === 0
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                  } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {t('gameResults.any')}
                </button>
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleFixedNumberOfSetsChange(num)}
                    disabled={!isEditing}
                    className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                      fixedNumberOfSets === num
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                    } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('gameResults.maxTotalPointsPerSet')}
              </label>
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      setMaxTotalPointsPerSet(0);
                      setCustomSetPoints('');
                    }}
                    disabled={!isEditing}
                    className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                      maxTotalPointsPerSet === 0
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                    } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {t('gameResults.any')}
                  </button>
                  {SET_PRESETS.map((num) => (
                    <button
                      key={num}
                      onClick={() => handleSetPresetClick(num)}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        maxTotalPointsPerSet === num && !customSetPoints
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={customSetPoints}
                    onChange={(e) => handleCustomSetPoints(e.target.value)}
                    placeholder={t('gameResults.customValue')}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-primary-500 focus:bg-white dark:focus:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 transition-all duration-200 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    max: 100
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('gameResults.maxPointsPerTeam')}
              </label>
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      setMaxPointsPerTeam(0);
                      setCustomTeamPoints('');
                    }}
                    disabled={!isEditing}
                    className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                      maxPointsPerTeam === 0
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                    } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {t('gameResults.any')}
                  </button>
                  {TEAM_PRESETS.map((num) => (
                    <button
                      key={num}
                      onClick={() => handleTeamPresetClick(num)}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        maxPointsPerTeam === num && !customTeamPoints
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={customTeamPoints}
                    onChange={(e) => handleCustomTeamPoints(e.target.value)}
                    placeholder={t('gameResults.customValue')}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-primary-500 focus:bg-white dark:focus:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 transition-all duration-200 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    max: 50
                  </span>
                </div>
              </div>
            </div>
              </>
            )}

            {activeTab === 'winner' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {t('gameResults.winnerOfMatch')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setWinnerOfMatch('BY_SCORES')}
                      disabled={!isEditing}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        winnerOfMatch === 'BY_SCORES'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.byScores')}
                    </button>
                    <button
                      onClick={() => setWinnerOfMatch('BY_SETS')}
                      disabled={!isEditing}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        winnerOfMatch === 'BY_SETS'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.bySets')}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {t('gameResults.winnerOfRound')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setWinnerOfRound('BY_MATCHES_WON')}
                      disabled={!isEditing}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        winnerOfRound === 'BY_MATCHES_WON'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.byMatchesWon')}
                    </button>
                    <button
                      onClick={() => setWinnerOfRound('BY_SCORES_DELTA')}
                      disabled={!isEditing}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        winnerOfRound === 'BY_SCORES_DELTA'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.byScoresDelta')}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {t('gameResults.winnerOfGame')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setWinnerOfGame('BY_ROUNDS_WON')}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        winnerOfGame === 'BY_ROUNDS_WON'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.byRoundsWon')}
                    </button>
                    <button
                      onClick={() => setWinnerOfGame('BY_MATCHES_WON')}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        winnerOfGame === 'BY_MATCHES_WON'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.byMatchesWon')}
                    </button>
                    <button
                      onClick={() => setWinnerOfGame('BY_SCORES_DELTA')}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        winnerOfGame === 'BY_SCORES_DELTA'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.byScoresDelta')}
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'matches' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {t('gameResults.matchGenerationType')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setMatchGenerationType('HANDMADE');
                        setProhibitMatchesEditing(false);
                      }}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        matchGenerationType === 'HANDMADE'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.matchGenerationTypeHandmade')}
                    </button>
                    <button
                      onClick={() => {
                        setMatchGenerationType('FIXED');
                        setProhibitMatchesEditing(false);
                      }}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        matchGenerationType === 'FIXED'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.matchGenerationTypeFixed')}
                    </button>
                    <button
                      onClick={() => setMatchGenerationType('RANDOM')}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        matchGenerationType === 'RANDOM'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.matchGenerationTypeRandom')}
                    </button>
                    <button
                      onClick={() => setMatchGenerationType('ROUND_ROBIN')}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        matchGenerationType === 'ROUND_ROBIN'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.matchGenerationTypeRoundRobin')}
                    </button>
                    <button
                      onClick={() => setMatchGenerationType('ESCALERA')}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        matchGenerationType === 'ESCALERA'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.matchGenerationTypeEscalera')}
                    </button>
                    <button
                      onClick={() => setMatchGenerationType('RATING')}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        matchGenerationType === 'RATING'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.matchGenerationTypeRating')}
                    </button>
                  </div>
                </div>

                {matchGenerationType !== 'HANDMADE' && matchGenerationType !== 'FIXED' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {t('gameResults.prohibitMatchesEditing')}
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setProhibitMatchesEditing(false)}
                        disabled={!isEditing}
                        className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                          !prohibitMatchesEditing
                            ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                        } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {t('gameResults.allow')}
                      </button>
                      <button
                        onClick={() => setProhibitMatchesEditing(true)}
                        disabled={!isEditing}
                        className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                          prohibitMatchesEditing
                            ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                        } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {t('gameResults.prohibit')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 text-sm rounded-lg font-semibold transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105"
            >
              {t('common.cancel')}
            </button>
            {isEditing && (
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg shadow-green-500/50 hover:scale-105"
              >
                {getStartText()}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

