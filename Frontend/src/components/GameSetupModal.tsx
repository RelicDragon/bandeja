import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityType, WinnerOfGame, WinnerOfMatch, MatchGenerationType } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { AnimatedTabs } from '@/components/AnimatedTabs';
import { AnimatePresence, motion } from 'framer-motion';

interface GameSetupModalProps {
  isOpen: boolean;
  entityType: EntityType;
  isEditing?: boolean;
  confirmButtonText?: string;
  initialValues?: {
    fixedNumberOfSets?: number;
    maxTotalPointsPerSet?: number;
    maxPointsPerTeam?: number;
    winnerOfGame?: WinnerOfGame;
    winnerOfMatch?: WinnerOfMatch;
    matchGenerationType?: MatchGenerationType;
    prohibitMatchesEditing?: boolean;
    pointsPerWin?: number;
    pointsPerLoose?: number;
    pointsPerTie?: number;
    ballsInGames?: boolean;
  };
  onClose: () => void;
  onConfirm: (params: {
    fixedNumberOfSets: number;
    maxTotalPointsPerSet: number;
    maxPointsPerTeam: number;
    winnerOfGame: WinnerOfGame;
    winnerOfMatch: WinnerOfMatch;
    matchGenerationType: MatchGenerationType;
    prohibitMatchesEditing?: boolean;
    pointsPerWin: number;
    pointsPerLoose: number;
    pointsPerTie: number;
    ballsInGames: boolean;
  }) => void;
}

export const GameSetupModal = ({ 
  isOpen, 
  entityType, 
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
    initialValues?.winnerOfGame ?? 'BY_MATCHES_WON'
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
  const [pointsPerWin, setPointsPerWin] = useState(initialValues?.pointsPerWin ?? 0);
  const [pointsPerLoose, setPointsPerLoose] = useState(initialValues?.pointsPerLoose ?? 0);
  const [pointsPerTie, setPointsPerTie] = useState(initialValues?.pointsPerTie ?? 0);
  const [ballsInGames, setBallsInGames] = useState(initialValues?.ballsInGames ?? false);

  const SET_PRESETS = [16, 21, 24, 32];
  const TEAM_PRESETS = [7, 15, 20];

  useEffect(() => {
    if (matchGenerationType === 'HANDMADE' || matchGenerationType === 'FIXED') {
      setProhibitMatchesEditing(false);
    }
  }, [matchGenerationType]);

  const handleConfirm = () => {
    onConfirm({
      fixedNumberOfSets,
      maxTotalPointsPerSet,
      maxPointsPerTeam,
      winnerOfGame,
      winnerOfMatch,
      matchGenerationType,
      prohibitMatchesEditing: matchGenerationType !== 'HANDMADE' && matchGenerationType !== 'FIXED' ? prohibitMatchesEditing : false,
      pointsPerWin,
      pointsPerLoose,
      pointsPerTie,
      ballsInGames,
    });
    onClose();
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

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="game-setup-modal">
      <DialogContent className="flex flex-col gap-2 p-2">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{t('gameResults.setupGame')}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="mb-4">
            <AnimatedTabs
              tabs={[
                { id: 'general', label: t('gameResults.general') },
                { id: 'winner', label: t('gameResults.winner') },
                { id: 'matches', label: t('gameResults.matches') },
              ]}
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as 'general' | 'winner' | 'matches')}
              variant="underline"
            />
          </div>

          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {activeTab === 'general' && (
                <motion.div
                  key="general"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                >
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

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('gameResults.ballsInGames')}
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setBallsInGames(false)}
                  disabled={!isEditing}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                    !ballsInGames
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                  } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {t('gameResults.ballsInGamesOff')}
                </button>
                <button
                  onClick={() => setBallsInGames(true)}
                  disabled={!isEditing}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                    ballsInGames
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                  } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {t('gameResults.ballsInGamesOn')}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {ballsInGames ? t('gameResults.ballsInGamesNoteOn') : t('gameResults.ballsInGamesNoteOff')}
              </p>
            </div>
                </motion.div>
              )}

              {activeTab === 'winner' && (
                <motion.div
                  key="winner"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                >
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
                    {t('gameResults.winnerOfGame')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
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

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {t('gameResults.points')}
                  </label>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'auto repeat(4, minmax(0, 1fr))' }}>
                    <span className="px-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('gameResults.win')}</span>
                    {[0, 1, 2, 3].map((num) => (
                      <button
                        key={num}
                        onClick={() => setPointsPerWin(num)}
                        disabled={!isEditing}
                        className={`px-2 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 ${
                          pointsPerWin === num
                            ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                        } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {num}
                      </button>
                    ))}
                    <span className="px-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('gameResults.tie')}</span>
                    {[0, 1, 2, 3].map((num) => (
                      <button
                        key={num}
                        onClick={() => setPointsPerTie(num)}
                        disabled={!isEditing}
                        className={`px-2 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 ${
                          pointsPerTie === num
                            ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                        } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {num}
                      </button>
                    ))}
                    <span className="px-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('gameResults.loose')}</span>
                    {[0, 1, 2, 3].map((num) => (
                      <button
                        key={num}
                        onClick={() => setPointsPerLoose(num)}
                        disabled={!isEditing}
                        className={`px-2 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 ${
                          pointsPerLoose === num
                            ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                        } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
                </motion.div>
              )}

              {activeTab === 'matches' && (
                <motion.div
                  key="matches"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                >
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
                    <button
                      onClick={() => setMatchGenerationType('WINNERS_COURT')}
                      disabled={!isEditing}
                      className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                        matchGenerationType === 'WINNERS_COURT'
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                      } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {t('gameResults.matchGenerationTypeWinnersCourt')}
                    </button>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {matchGenerationType === 'HANDMADE' && t('gameResults.matchGenerationTypeHandmadeNote')}
                    {matchGenerationType === 'FIXED' && t('gameResults.matchGenerationTypeFixedNote')}
                    {matchGenerationType === 'RANDOM' && t('gameResults.matchGenerationTypeRandomNote')}
                    {matchGenerationType === 'ROUND_ROBIN' && t('gameResults.matchGenerationTypeRoundRobinNote')}
                    {matchGenerationType === 'ESCALERA' && t('gameResults.matchGenerationTypeEscaleraNote')}
                    {matchGenerationType === 'RATING' && t('gameResults.matchGenerationTypeRatingNote')}
                    {matchGenerationType === 'WINNERS_COURT' && t('gameResults.matchGenerationTypeWinnersCourtNote')}
                  </p>
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>

          <DialogFooter className="flex-shrink-0 flex gap-2 -mb-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg font-semibold transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105 p-2"
            >
              {t('common.cancel')}
            </button>
            {isEditing && (
              <button
                onClick={handleConfirm}
                className="flex-1 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg shadow-green-500/50 hover:scale-105 p-2"
              >
                {getStartText()}
              </button>
            )}
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

