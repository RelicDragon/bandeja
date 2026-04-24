import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Minus, Plus, Zap, X } from 'lucide-react';
import { Button } from '@/components';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser, Game } from '@/types';
import { Dialog, DialogContent, DialogFooter, DialogClose, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
  getRules,
  getKeypadOptions,
  getSetKind,
  isLegalSetScore,
  validationMessage,
  suggestLegalScores,
  getScoreEntryExampleList,
} from '@/utils/scoring';
interface SetResultModalProps {
  match: Match;
  setIndex: number;
  players: BasicUser[];
  courtLabel?: string | null;
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

export const SetResultModal = ({
  match,
  setIndex,
  players,
  courtLabel,
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
}: SetResultModalProps) => {
  const { t } = useTranslation();

  const rules = useMemo(
    () => getRules(
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

  // Prevent equal scores when tiebreak is enabled
  useEffect(() => {
    // Only adjust when tiebreak is toggled ON (not when it's already on)
    if (isTieBreak && !prevIsTieBreakRef.current && teamAScore === teamBScore && teamAScore > 0) {
      // Adjust teamA score by 1 to make them different
      setTeamAScore(teamAScore + 1);
    }
    prevIsTieBreakRef.current = isTieBreak;
  }, [isTieBreak, teamAScore, teamBScore]);

  const keypad = getKeypadOptions(rules, setIndex, match.sets, isTieBreak);
  const kind = getSetKind(setIndex, match.sets, rules, { teamA: teamAScore, teamB: teamBScore, isTieBreak });

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

  const validation = isLegalSetScore(teamAScore, teamBScore, rules, setIndex, match.sets, isTieBreak);
  const suggestions = !validation.ok && (teamAScore > 0 || teamBScore > 0)
    ? suggestLegalScores(teamAScore, teamBScore, rules, setIndex, match.sets)
    : [];

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

  const teamAPlayers = match.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as BasicUser[];
  const teamBPlayers = match.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as BasicUser[];

  const numberOptions = keypad.values.filter((number) => {
    if (keypad.mode !== 'PAIRED' && isTieBreak) {
      if (numberPickerTeam === 'teamA') return number !== teamBScore;
      if (numberPickerTeam === 'teamB') return number !== teamAScore;
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

  const canToggleTieBreak = false;

  const showTieBreakToggle = canToggleTieBreak && kind !== 'SUPER_TIEBREAK';

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
      <div className="relative flex items-center justify-center w-7 sm:w-8 flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <span className="absolute [writing-mode:vertical-lr] rotate-180 text-[10px] sm:text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap select-none">
          {courtLabel?.trim() ? courtLabel.trim() : t('gameResults.court')}
        </span>
      </div>
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <div className="relative z-[1] shrink-0 px-3 sm:px-4 pt-3 pb-2 border-b border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-gray-900/95">
        <DialogTitle className="mb-0 text-base sm:text-lg font-semibold leading-tight text-gray-900 dark:text-white pr-2">
          {mainTitle}
        </DialogTitle>
        {descriptionLine ? (
          <DialogDescription className="mt-0 max-w-full whitespace-nowrap text-xs font-medium normal-case leading-tight text-gray-500 dark:text-gray-400 overflow-x-auto">
            {descriptionLine}
          </DialogDescription>
        ) : null}
      </div>

      <div className="relative z-0 flex-1 min-h-0 overflow-y-auto py-4 px-3 sm:px-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-primary-600/5 rounded-2xl sm:rounded-3xl" />
        <div className={`relative z-[1] transition-all duration-500 ${!isNumberPickerMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
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
                      disabled={teamAScore >= keypad.max}
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
                      disabled={teamBScore >= keypad.max}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              </div>
        </div>
        
        <div className={`relative z-[1] transition-all duration-500 ${isNumberPickerMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
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
      
      {!validation.ok && validation.reason && (teamAScore > 0 || teamBScore > 0) && (
        <div className="px-3 sm:px-4 pb-1">
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
          disabled={!validation.ok && (teamAScore > 0 || teamBScore > 0)}
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
