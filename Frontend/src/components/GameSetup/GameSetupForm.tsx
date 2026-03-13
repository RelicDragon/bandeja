import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WinnerOfGame, WinnerOfMatch, MatchGenerationType, GameSetupParams } from '@/types';
import { AnimatedTabs } from '@/components/AnimatedTabs';
import { AnimatePresence, motion } from 'framer-motion';

const SET_PRESETS = [16, 21, 24, 32];

export interface GameSetupFormInitialValues {
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
}

export interface GameSetupFormRef {
  submit: () => void;
}

interface GameSetupFormProps {
  initialValues?: GameSetupFormInitialValues;
  isEditing?: boolean;
  onConfirm: (params: GameSetupParams) => void;
}

export const GameSetupForm = forwardRef<GameSetupFormRef, GameSetupFormProps>(function GameSetupForm(
  { initialValues, isEditing = true, onConfirm },
  ref
) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'winner' | 'matches'>('general');
  const [fixedNumberOfSets, setFixedNumberOfSets] = useState(initialValues?.fixedNumberOfSets ?? 0);
  const [maxTotalPointsPerSet, setMaxTotalPointsPerSet] = useState(initialValues?.maxTotalPointsPerSet ?? 0);
  const [customSetPoints, setCustomSetPoints] = useState('');
  const [winnerOfGame, setWinnerOfGame] = useState<WinnerOfGame>(initialValues?.winnerOfGame ?? 'BY_MATCHES_WON');
  const [winnerOfMatch, setWinnerOfMatch] = useState<WinnerOfMatch>(initialValues?.winnerOfMatch ?? 'BY_SCORES');
  const [matchGenerationType, setMatchGenerationType] = useState<MatchGenerationType>(
    initialValues?.matchGenerationType ?? 'HANDMADE'
  );
  const [prohibitMatchesEditing, setProhibitMatchesEditing] = useState(initialValues?.prohibitMatchesEditing ?? false);
  const [pointsPerWin, setPointsPerWin] = useState(initialValues?.pointsPerWin ?? 0);
  const [pointsPerLoose, setPointsPerLoose] = useState(initialValues?.pointsPerLoose ?? 0);
  const [pointsPerTie, setPointsPerTie] = useState(initialValues?.pointsPerTie ?? 0);
  const [ballsInGames, setBallsInGames] = useState(initialValues?.ballsInGames ?? false);

  useEffect(() => {
    if (matchGenerationType === 'HANDMADE' || matchGenerationType === 'FIXED') {
      setProhibitMatchesEditing(false);
    }
  }, [matchGenerationType]);

  useEffect(() => {
    if (!initialValues) return;
    const setVal = initialValues.maxTotalPointsPerSet ?? 0;
    setCustomSetPoints(setVal > 0 && !SET_PRESETS.includes(setVal) ? String(setVal) : '');
  }, [initialValues]);

  const buildPayload = useCallback((): GameSetupParams => ({
    fixedNumberOfSets,
    maxTotalPointsPerSet,
    maxPointsPerTeam: 0,
    winnerOfGame,
    winnerOfMatch,
    matchGenerationType,
    prohibitMatchesEditing: matchGenerationType !== 'HANDMADE' && matchGenerationType !== 'FIXED' ? prohibitMatchesEditing : false,
    pointsPerWin,
    pointsPerLoose,
    pointsPerTie,
    ballsInGames,
  }), [
    fixedNumberOfSets,
    maxTotalPointsPerSet,
    winnerOfGame,
    winnerOfMatch,
    matchGenerationType,
    prohibitMatchesEditing,
    pointsPerWin,
    pointsPerLoose,
    pointsPerTie,
    ballsInGames,
  ]);

  const submitRef = useRef<() => void>(() => {});
  submitRef.current = () => onConfirm(buildPayload());
  useImperativeHandle(ref, () => ({ submit: () => submitRef.current() }), []);

  const handleCustomSetPoints = (value: string) => {
    setCustomSetPoints(value);
    const num = parseInt(value);
    if (!isNaN(num) && num > 0 && num <= 100) setMaxTotalPointsPerSet(num);
    else if (value === '') setMaxTotalPointsPerSet(0);
  };

  const handleSetPresetClick = (num: number) => {
    setMaxTotalPointsPerSet(num);
    setCustomSetPoints(String(num));
  };

  const handleFixedNumberOfSetsChange = (num: number) => {
    setFixedNumberOfSets(num);
    if (num === 1) setWinnerOfMatch('BY_SCORES');
  };

  const btn = (active: boolean, disabled: boolean) =>
    `px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
      active
        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/50 scale-105'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
    } ${!disabled ? '' : 'opacity-60 cursor-not-allowed'}`;

  return (
    <>
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
                  <button type="button" onClick={() => handleFixedNumberOfSetsChange(0)} disabled={!isEditing} className={btn(fixedNumberOfSets === 0, !isEditing)}>
                    {t('gameResults.any')}
                  </button>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button key={num} type="button" onClick={() => handleFixedNumberOfSetsChange(num)} disabled={!isEditing} className={btn(fixedNumberOfSets === num, !isEditing)}>
                      {num}
                    </button>
                  ))}
                </div>
                {fixedNumberOfSets !== 1 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('gameResults.fixedNumberOfSetsAmericanoHint')}</p>
                )}
              </div>
              <hr className="border-gray-200 dark:border-gray-700 my-4" />
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {t('gameResults.maxTotalPointsPerSet')}
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => { setMaxTotalPointsPerSet(0); setCustomSetPoints(''); }}
                      disabled={!isEditing}
                      className={btn(maxTotalPointsPerSet === 0, !isEditing)}
                    >
                      {t('gameResults.any')}
                    </button>
                    {SET_PRESETS.map((num) => (
                      <button key={num} type="button" onClick={() => handleSetPresetClick(num)} disabled={!isEditing} className={btn(maxTotalPointsPerSet === num, !isEditing)}>
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={customSetPoints}
                      onChange={(e) => handleCustomSetPoints(e.target.value)}
                      placeholder={t('gameResults.customValue')}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border-2 border-transparent focus:border-primary-500 focus:bg-white dark:focus:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 transition-all duration-200 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">max: 100</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {maxTotalPointsPerSet === 0 ? t('gameResults.maxTotalPointsPerSetHintAny') : t('gameResults.maxTotalPointsPerSetHintSet', { count: maxTotalPointsPerSet })}
                  </p>
                </div>
              </div>
              <hr className="border-gray-200 dark:border-gray-700 my-4" />
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {t('gameResults.ballsInGames')}
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBallsInGames(false)} disabled={!isEditing} className={`flex-1 ${btn(!ballsInGames, !isEditing)}`}>
                    {t('gameResults.ballsInGamesOff')}
                  </button>
                  <button type="button" onClick={() => setBallsInGames(true)} disabled={!isEditing} className={`flex-1 ${btn(ballsInGames, !isEditing)}`}>
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
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('gameResults.winnerOfMatch')}</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setWinnerOfMatch('BY_SCORES')} disabled={!isEditing} className={`flex-1 ${btn(winnerOfMatch === 'BY_SCORES', !isEditing)}`}>
                    {t('gameResults.byScores')}
                  </button>
                  <button type="button" onClick={() => setWinnerOfMatch('BY_SETS')} disabled={!isEditing} className={`flex-1 ${btn(winnerOfMatch === 'BY_SETS', !isEditing)}`}>
                    {t('gameResults.bySets')}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('gameResults.winnerOfGame')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setWinnerOfGame('BY_MATCHES_WON')} disabled={!isEditing} className={btn(winnerOfGame === 'BY_MATCHES_WON', !isEditing)}>
                    {t('gameResults.byMatchesWon')}
                  </button>
                  <button type="button" onClick={() => setWinnerOfGame('BY_SCORES_DELTA')} disabled={!isEditing} className={btn(winnerOfGame === 'BY_SCORES_DELTA', !isEditing)}>
                    {t('gameResults.byScoresDelta')}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('gameResults.points')}</label>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'auto repeat(4, minmax(0, 1fr))' }}>
                  <span className="px-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('gameResults.win')}</span>
                  {[0, 1, 2, 3].map((num) => (
                    <button key={num} type="button" onClick={() => setPointsPerWin(num)} disabled={!isEditing} className={btn(pointsPerWin === num, !isEditing)}>{num}</button>
                  ))}
                  <span className="px-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('gameResults.tie')}</span>
                  {[0, 1, 2, 3].map((num) => (
                    <button key={num} type="button" onClick={() => setPointsPerTie(num)} disabled={!isEditing} className={btn(pointsPerTie === num, !isEditing)}>{num}</button>
                  ))}
                  <span className="px-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('gameResults.loose')}</span>
                  {[0, 1, 2, 3].map((num) => (
                    <button key={num} type="button" onClick={() => setPointsPerLoose(num)} disabled={!isEditing} className={btn(pointsPerLoose === num, !isEditing)}>{num}</button>
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
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('gameResults.matchGenerationType')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setMatchGenerationType('HANDMADE'); setProhibitMatchesEditing(false); }} disabled={!isEditing} className={btn(matchGenerationType === 'HANDMADE', !isEditing)}>{t('gameResults.matchGenerationTypeHandmade')}</button>
                  <button type="button" onClick={() => { setMatchGenerationType('FIXED'); setProhibitMatchesEditing(false); }} disabled={!isEditing} className={btn(matchGenerationType === 'FIXED', !isEditing)}>{t('gameResults.matchGenerationTypeFixed')}</button>
                  <button type="button" onClick={() => setMatchGenerationType('RANDOM')} disabled={!isEditing} className={btn(matchGenerationType === 'RANDOM', !isEditing)}>{t('gameResults.matchGenerationTypeRandom')}</button>
                  <button type="button" onClick={() => setMatchGenerationType('ROUND_ROBIN')} disabled={!isEditing} className={btn(matchGenerationType === 'ROUND_ROBIN', !isEditing)}>{t('gameResults.matchGenerationTypeRoundRobin')}</button>
                  <button type="button" onClick={() => setMatchGenerationType('ESCALERA')} disabled={!isEditing} className={btn(matchGenerationType === 'ESCALERA', !isEditing)}>{t('gameResults.matchGenerationTypeEscalera')}</button>
                  <button type="button" onClick={() => setMatchGenerationType('RATING')} disabled={!isEditing} className={btn(matchGenerationType === 'RATING', !isEditing)}>{t('gameResults.matchGenerationTypeRating')}</button>
                  <button type="button" onClick={() => setMatchGenerationType('WINNERS_COURT')} disabled={!isEditing} className={btn(matchGenerationType === 'WINNERS_COURT', !isEditing)}>{t('gameResults.matchGenerationTypeWinnersCourt')}</button>
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
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('gameResults.prohibitMatchesEditing')}</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setProhibitMatchesEditing(false)} disabled={!isEditing} className={`flex-1 ${btn(!prohibitMatchesEditing, !isEditing)}`}>
                      {t('gameResults.allow')}
                    </button>
                    <button type="button" onClick={() => setProhibitMatchesEditing(true)} disabled={!isEditing} className={`flex-1 ${btn(prohibitMatchesEditing, !isEditing)}`}>
                      {t('gameResults.prohibit')}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
});
