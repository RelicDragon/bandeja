import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, ChevronUp, ChevronDown, Zap } from 'lucide-react';
import { Button } from '@/components';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser, Game } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
  getRules,
  getKeypadOptions,
  getSetKind,
  isLegalSetScore,
  validationMessage,
  suggestLegalScores,
  getScoreEntryExampleList,
} from '@/utils/scoring';

interface HorizontalScoreEntryModalProps {
  match: Match;
  setIndex: number;
  players: BasicUser[];
  maxTotalPointsPerSet?: number;
  maxPointsPerTeam?: number;
  fixedNumberOfSets?: number;
  ballsInGames?: boolean;
  game?: Pick<Game, 'scoringPreset' | 'fixedNumberOfSets' | 'maxTotalPointsPerSet' | 'maxPointsPerTeam' | 'winnerOfMatch' | 'ballsInGames' | 'hasGoldenPoint' | 'pointsPerTie'> | null;
  onSave: (matchId: string, setIndex: number, teamAScore: number, teamBScore: number, isTieBreak?: boolean) => void;
  onRemove?: (matchId: string, setIndex: number) => void;
  onClose: () => void;
  canRemove?: boolean;
  isOpen: boolean;
  roundNumber?: number;
}

export const HorizontalScoreEntryModal = ({
  match,
  setIndex,
  players,
  maxTotalPointsPerSet,
  maxPointsPerTeam,
  fixedNumberOfSets,
  ballsInGames = false,
  game,
  onSave,
  onRemove,
  onClose,
  canRemove = false,
  isOpen,
  roundNumber,
}: HorizontalScoreEntryModalProps) => {
  const { t } = useTranslation();

  const rules = useMemo(
    () =>
      getRules(
        game ?? {
          scoringPreset: null,
          fixedNumberOfSets: fixedNumberOfSets ?? 0,
          maxTotalPointsPerSet: maxTotalPointsPerSet ?? 0,
          maxPointsPerTeam: maxPointsPerTeam ?? 0,
          winnerOfMatch: ballsInGames ? 'BY_SETS' : 'BY_SCORES',
          ballsInGames,
          hasGoldenPoint: false,
          pointsPerTie: 0,
        } as any
      ),
    [game, fixedNumberOfSets, maxTotalPointsPerSet, maxPointsPerTeam, ballsInGames]
  );

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

  const kind = getSetKind(setIndex, match.sets, rules, { teamA: teamAScore, teamB: teamBScore, isTieBreak });
  const keypad = getKeypadOptions(rules, setIndex, match.sets, isTieBreak);

  const clampToAllowed = (value: number): number => {
    if (keypad.values.length === 0) return value;
    if (keypad.values.includes(value)) return value;
    return Math.max(keypad.values[0], Math.min(keypad.values[keypad.values.length - 1], value));
  };

  const handleTeamAScoreChange = (newScore: number) => {
    const clamped = Math.max(0, clampToAllowed(newScore));
    setTeamAScore(clamped);
    if (keypad.mode === 'PAIRED' && keypad.pairedTotal !== undefined) {
      setTeamBScore(Math.max(0, keypad.pairedTotal - clamped));
    }
  };

  const handleTeamBScoreChange = (newScore: number) => {
    const clamped = Math.max(0, clampToAllowed(newScore));
    setTeamBScore(clamped);
    if (keypad.mode === 'PAIRED' && keypad.pairedTotal !== undefined) {
      setTeamAScore(Math.max(0, keypad.pairedTotal - clamped));
    }
  };

  useEffect(() => {
    if (isTieBreak && !prevIsTieBreakRef.current && teamAScore === teamBScore && teamAScore > 0) {
      setTeamAScore(teamAScore + 1);
    }
    prevIsTieBreakRef.current = isTieBreak;
  }, [isTieBreak, teamAScore, teamBScore]);

  const teamAPlayers = match.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as BasicUser[];
  const teamBPlayers = match.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as BasicUser[];

  const validation = isLegalSetScore(teamAScore, teamBScore, rules, setIndex, match.sets, isTieBreak);
  const suggestions = !validation.ok && (teamAScore > 0 || teamBScore > 0)
    ? suggestLegalScores(teamAScore, teamBScore, rules, setIndex, match.sets)
    : [];

  const canToggleTieBreak = false;

  const showTieBreakToggle = canToggleTieBreak && kind !== 'SUPER_TIEBREAK';

  const handleSave = () => {
    if (!validation.ok) return;
    const finalIsTieBreak = kind === 'TIEBREAK_GAME' || kind === 'SUPER_TIEBREAK';
    onSave(match.id, setIndex, teamAScore, teamBScore, finalIsTieBreak);
    onClose();
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove(match.id, setIndex);
      onClose();
    }
  };

  const numberOptions = keypad.values.filter((number) => {
    if (keypad.mode !== 'PAIRED' && isTieBreak) {
      if (numberPickerTeam === 'teamA') return number !== teamBScore;
      if (numberPickerTeam === 'teamB') return number !== teamAScore;
    }
    return true;
  });

  const handleNumberSelect = (number: number) => {
    if (numberPickerTeam === 'teamA') handleTeamAScoreChange(number);
    else if (numberPickerTeam === 'teamB') handleTeamBScoreChange(number);
    setNumberPickerTeam(null);
  };

  const isNumberPickerMode = numberPickerTeam !== null;
  const selectedTeamPlayers = numberPickerTeam === 'teamA' ? teamAPlayers : numberPickerTeam === 'teamB' ? teamBPlayers : [];
  const currentScore = numberPickerTeam === 'teamA' ? teamAScore : numberPickerTeam === 'teamB' ? teamBScore : 0;
  const isTeamAWinning = teamAScore > teamBScore;
  const isTeamBWinning = teamBScore > teamAScore;

  const aIncUpperBound = keypad.max;
  const bIncUpperBound = keypad.max;

  const mainTitle =
    (rules.fixedNumberOfSets === 1 ? t('gameResults.matchResult') : t('gameResults.setResult')) +
    (kind === 'SUPER_TIEBREAK'
      ? ` · ${t('gameResults.superTieBreak')}`
      : kind === 'TIEBREAK_GAME'
        ? ` · ${t('gameResults.tieBreak')}`
        : '');

  const exampleList = useMemo(() => getScoreEntryExampleList(rules, kind), [rules, kind]);

  const descriptionLine = useMemo(() => {
    const parts: string[] = [];
    if (roundNumber != null && roundNumber > 0) {
      parts.push(t('gameResults.roundNumber', { number: roundNumber }));
    }
    if (exampleList) {
      parts.push(t('gameResults.scoreEntryExamples', { examples: exampleList }));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [roundNumber, exampleList, t]);

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="horizontal-score-entry-modal">
      <DialogContent>
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-primary-600/5 rounded-2xl sm:rounded-3xl pointer-events-none" />

      <DialogHeader className="mb-3 sm:mb-5 md:mb-8 flex-col items-stretch gap-0 text-left">
        <DialogTitle className="mb-0 text-left leading-tight">{mainTitle}</DialogTitle>
        {descriptionLine ? (
          <DialogDescription className="mt-0 max-w-full whitespace-nowrap text-left text-xs font-medium normal-case leading-tight text-gray-500 dark:text-gray-400 overflow-x-auto sm:text-sm">
            {descriptionLine}
          </DialogDescription>
        ) : null}
      </DialogHeader>

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
                      disabled={teamAScore >= aIncUpperBound}
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
                      disabled={teamBScore >= bIncUpperBound}
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

      {showTieBreakToggle && (
        <div className="px-3 sm:px-6 md:px-8 pb-2">
          <div className="flex items-center justify-center gap-2 p-2 sm:p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <Zap
                className={`w-4 h-4 transition-colors duration-300 ${
                  isTieBreak ? 'text-yellow-500 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-500'
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
                  isTieBreak ? 'bg-gradient-to-r from-primary-500 to-primary-600' : 'bg-gray-300 dark:bg-gray-600'
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

      {!validation.ok && validation.reason && (teamAScore > 0 || teamBScore > 0) && (
        <div className="px-3 sm:px-6 md:px-8 pb-2">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            {validationMessage(t, validation.reason, validation.detail)}
            {suggestions.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setTeamAScore(s.teamA);
                      setTeamBScore(s.teamB);
                      if (typeof s.isTieBreak === 'boolean') setIsTieBreak(s.isTieBreak);
                    }}
                    className="rounded-full bg-amber-200 px-2 py-0.5 font-mono font-semibold text-amber-900 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100 dark:hover:bg-amber-700"
                  >
                    {s.teamA}-{s.teamB}{s.isTieBreak ? ' (TB)' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 sm:gap-3 pt-4 px-3 sm:px-6 md:px-8 pb-3 sm:pb-6 md:pb-8">
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
          disabled={!validation.ok && (teamAScore > 0 || teamBScore > 0)}
          className="flex-1 h-10 sm:h-11 md:h-12 rounded-xl font-semibold bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {t('common.save')}
        </Button>
      </div>
      </DialogContent>
    </Dialog>
  );
};
