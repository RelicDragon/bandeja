import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Match } from '@/types/gameResults';
import { BasicUser, Game } from '@/types';
import {
  getRules,
  getKeypadOptions,
  getSetKind,
  isLegalSetScore,
  suggestLegalScores,
  getScoreEntryExampleList,
  isClassicTimedRelaxedGameScores,
  isClassicAutomaticRelaxedScores,
  canUseSuperTiebreakEntry,
  parseAutomaticMatchRecordMode,
  mergeAutomaticMatchRecordMetadata,
  resolveAutomaticSetEntryMode,
  automaticSetEntryUsesTieBreak,
  recommendAutomaticSetScore,
  getAutomaticRelaxedKeypadOptions,
  AUTOMATIC_GAMES_ENTRY_MAX,
  type AutomaticMatchRecordMode,
  type ValidationResult,
  type ScoreSuggestion,
} from '@/utils/scoring';
import { capPlayerIds, maxPlayersPerTeamForGame } from '@/utils/matchFormat';
import { isSupplementalMatchSet, EXTRA_BALLS_SCORE_MAX, type MatchSetRole } from '@/utils/matchSetRole';
import { KEYPAD_SELECTION_CONFIRM_MS, resolveKeypadTeamAfterPick } from './scoreKeypadSlide';

export type ScoreEntryGame = Pick<
  Game,
  | 'scoringPreset'
  | 'fixedNumberOfSets'
  | 'maxTotalPointsPerSet'
  | 'maxPointsPerTeam'
  | 'winnerOfMatch'
  | 'ballsInGames'
  | 'deucesBeforeGoldenPoint'
  | 'pointsPerTie'
  | 'matchTimedCapMinutes'
  | 'sport'
> &
  Partial<Pick<Game, 'playersPerMatch' | 'matchTimerEnabled'>>;

export type ScoreEntrySaveHandler = (
  matchId: string,
  setIndex: number,
  teamAScore: number,
  teamBScore: number,
  isTieBreak?: boolean,
  supplementalRole?: Extract<MatchSetRole, 'EXTRA_GAMES' | 'EXTRA_BALLS'>,
  options?: { automaticRecordMode?: AutomaticMatchRecordMode },
) => void;

interface UseScoreEntryStateParams {
  match: Match;
  setIndex: number;
  players: BasicUser[];
  game?: ScoreEntryGame | null;
  maxTotalPointsPerSet?: number;
  maxPointsPerTeam?: number;
  fixedNumberOfSets?: number;
  ballsInGames?: boolean;
  roundNumber?: number;
  onSave: ScoreEntrySaveHandler;
  onClose: () => void;
  onRemove?: (matchId: string, setIndex: number) => void;
}

export function useScoreEntryState({
  match,
  setIndex,
  players,
  game,
  maxTotalPointsPerSet,
  maxPointsPerTeam,
  fixedNumberOfSets,
  ballsInGames = false,
  roundNumber,
  onSave,
  onClose,
  onRemove,
}: UseScoreEntryStateParams) {
  const { t } = useTranslation();

  const rules = useMemo(
    () =>
      getRules(
        (game ?? {
          scoringPreset: null,
          fixedNumberOfSets: fixedNumberOfSets ?? 0,
          maxTotalPointsPerSet: maxTotalPointsPerSet ?? 0,
          maxPointsPerTeam: maxPointsPerTeam ?? 0,
          winnerOfMatch: ballsInGames ? 'BY_SETS' : 'BY_SCORES',
          ballsInGames,
          deucesBeforeGoldenPoint: null,
          pointsPerTie: 0,
        }) as Game,
      ),
    [game, fixedNumberOfSets, maxTotalPointsPerSet, maxPointsPerTeam, ballsInGames],
  );

  const currentSet = useMemo(
    () => match.sets[setIndex] || { teamA: 0, teamB: 0, isTieBreak: false },
    [match.sets, setIndex],
  );
  const isSupplementalRow = isSupplementalMatchSet(currentSet);
  const isAutomaticRelaxed = isClassicAutomaticRelaxedScores(rules);

  const [extraRole, setExtraRole] = useState<'EXTRA_GAMES' | 'EXTRA_BALLS'>(
    currentSet.role === 'EXTRA_BALLS' ? 'EXTRA_BALLS' : 'EXTRA_GAMES',
  );
  const [teamAScore, setTeamAScore] = useState(currentSet.teamA);
  const [teamBScore, setTeamBScore] = useState(currentSet.teamB);
  const [isTieBreak, setIsTieBreak] = useState(currentSet.isTieBreak || false);
  const [matchRecordMode, setMatchRecordMode] = useState<AutomaticMatchRecordMode>(() =>
    parseAutomaticMatchRecordMode(match.metadata),
  );
  const [useSuperTiebreak, setUseSuperTiebreak] = useState(
    () => Boolean(currentSet.isTieBreak) && canUseSuperTiebreakEntry(setIndex, match.sets, rules),
  );
  const [pickerTeam, setPickerTeam] = useState<'teamA' | 'teamB' | null>(null);
  const keypadAdvanceTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const keypadFirstPickDoneRef = useRef(false);

  const clearKeypadAdvance = useCallback(() => {
    if (keypadAdvanceTimerRef.current !== null) {
      globalThis.clearTimeout(keypadAdvanceTimerRef.current);
      keypadAdvanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!pickerTeam) {
      clearKeypadAdvance();
      keypadFirstPickDoneRef.current = false;
    }
  }, [pickerTeam, clearKeypadAdvance]);

  useEffect(() => () => clearKeypadAdvance(), [clearKeypadAdvance]);

  useEffect(() => {
    setTeamAScore(currentSet.teamA);
    setTeamBScore(currentSet.teamB);
    setIsTieBreak(currentSet.isTieBreak || false);
    if (isSupplementalMatchSet(currentSet)) {
      setExtraRole(currentSet.role === 'EXTRA_BALLS' ? 'EXTRA_BALLS' : 'EXTRA_GAMES');
    }
    if (isAutomaticRelaxed) {
      setMatchRecordMode(parseAutomaticMatchRecordMode(match.metadata));
      setUseSuperTiebreak(
        Boolean(currentSet.isTieBreak) && canUseSuperTiebreakEntry(setIndex, match.sets, rules),
      );
    }
  }, [currentSet, isAutomaticRelaxed, match.metadata, match.sets, rules, setIndex]);

  useEffect(() => {
    if (!isSupplementalRow || extraRole !== 'EXTRA_BALLS') return;
    setTeamAScore((a) => Math.min(EXTRA_BALLS_SCORE_MAX, a));
    setTeamBScore((b) => Math.min(EXTRA_BALLS_SCORE_MAX, b));
  }, [extraRole, isSupplementalRow]);

  const canUseSuperTiebreak = canUseSuperTiebreakEntry(setIndex, match.sets, rules);
  const persistedRecordMode = parseAutomaticMatchRecordMode(match.metadata);
  const entryMode = isAutomaticRelaxed
    ? resolveAutomaticSetEntryMode(
        setIndex,
        match.sets,
        rules,
        setIndex === 0
          ? mergeAutomaticMatchRecordMetadata(match.metadata, matchRecordMode)
          : match.metadata,
        useSuperTiebreak,
      )
    : null;
  const relaxedKeypad =
    isAutomaticRelaxed && entryMode ? getAutomaticRelaxedKeypadOptions(rules, entryMode) : null;
  const keypad = relaxedKeypad
    ? null
    : getKeypadOptions(rules, setIndex, match.sets, isTieBreak);
  const isAutomaticGamesEntry =
    isAutomaticRelaxed && !isSupplementalRow && entryMode === 'GAMES';
  const kind = getSetKind(setIndex, match.sets, rules, { teamA: teamAScore, teamB: teamBScore, isTieBreak });
  const hintKind = entryMode === 'SUPER_TIEBREAK' ? ('SUPER_TIEBREAK' as const) : kind;

  useEffect(() => {
    if (!isAutomaticGamesEntry) return;
    setTeamAScore((a) => Math.min(AUTOMATIC_GAMES_ENTRY_MAX, a));
    setTeamBScore((b) => Math.min(AUTOMATIC_GAMES_ENTRY_MAX, b));
  }, [isAutomaticGamesEntry, matchRecordMode, useSuperTiebreak]);

  const extraBallsPicker = isSupplementalRow && extraRole === 'EXTRA_BALLS';
  const scoreMax = extraBallsPicker
    ? EXTRA_BALLS_SCORE_MAX
    : isSupplementalRow
      ? 9999
      : (relaxedKeypad?.max ?? keypad?.max ?? 99);
  const scorePickerKeypadMax = scoreMax;

  const clampToAllowed = (value: number): number => {
    if (extraBallsPicker) {
      return Math.max(0, Math.min(EXTRA_BALLS_SCORE_MAX, Math.round(value)));
    }
    if (relaxedKeypad) {
      return Math.max(0, Math.min(relaxedKeypad.max, Math.round(value)));
    }
    if (!keypad || keypad.values.length === 0) return value;
    if (keypad.values.includes(value)) return value;
    return Math.max(keypad.values[0], Math.min(keypad.values[keypad.values.length - 1], value));
  };

  const setTeamScore = (team: 'teamA' | 'teamB', newScore: number) => {
    const setOwn = team === 'teamA' ? setTeamAScore : setTeamBScore;
    const setOther = team === 'teamA' ? setTeamBScore : setTeamAScore;
    if (isSupplementalRow) {
      const cap = extraRole === 'EXTRA_BALLS' ? EXTRA_BALLS_SCORE_MAX : 9999;
      setOwn(Math.min(cap, Math.max(0, newScore)));
      return;
    }
    const clamped = Math.max(0, clampToAllowed(newScore));
    setOwn(clamped);
    if (keypad?.mode === 'PAIRED' && keypad.pairedTotal !== undefined) {
      setOther(Math.max(0, keypad.pairedTotal - clamped));
    }
  };

  const validation: ValidationResult = isSupplementalRow
    ? { ok: true }
    : isAutomaticRelaxed
      ? { ok: true, kind }
      : isLegalSetScore(teamAScore, teamBScore, rules, setIndex, match.sets, isTieBreak);
  const recommendation: ValidationResult =
    isAutomaticRelaxed && entryMode && (teamAScore > 0 || teamBScore > 0)
      ? recommendAutomaticSetScore(teamAScore, teamBScore, rules, entryMode)
      : validation;
  const suggestions: ScoreSuggestion[] =
    !recommendation.ok && (teamAScore > 0 || teamBScore > 0)
      ? suggestLegalScores(teamAScore, teamBScore, rules, setIndex, match.sets)
      : [];

  const handleSave = () => {
    if (isSupplementalRow) {
      onSave(match.id, setIndex, teamAScore, teamBScore, false, extraRole);
      onClose();
      return;
    }
    if (!validation.ok && !isAutomaticRelaxed) return;
    const finalIsTieBreak = isAutomaticRelaxed
      ? automaticSetEntryUsesTieBreak(setIndex, match.sets, rules, useSuperTiebreak)
      : kind === 'TIEBREAK_GAME' || kind === 'SUPER_TIEBREAK';
    const saveOptions =
      isAutomaticRelaxed && setIndex === 0 ? { automaticRecordMode: matchRecordMode } : undefined;
    onSave(match.id, setIndex, teamAScore, teamBScore, finalIsTieBreak, undefined, saveOptions);
    onClose();
  };

  const handleRemove = () => {
    if (!onRemove) return;
    onRemove(match.id, setIndex);
    onClose();
  };

  const applySuggestion = (s: ScoreSuggestion) => {
    setTeamAScore(s.teamA);
    setTeamBScore(s.teamB);
    if (typeof s.isTieBreak === 'boolean') setIsTieBreak(s.isTieBreak);
  };

  const maxPlayersPerTeam = maxPlayersPerTeamForGame(game ?? null, players.length);
  const teamAPlayers = capPlayerIds(match.teamA, maxPlayersPerTeam)
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as BasicUser[];
  const teamBPlayers = capPlayerIds(match.teamB, maxPlayersPerTeam)
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as BasicUser[];

  const baseNumberOptions = extraBallsPicker
    ? Array.from({ length: EXTRA_BALLS_SCORE_MAX + 1 }, (_, i) => i)
    : relaxedKeypad
      ? Array.from({ length: relaxedKeypad.max + 1 }, (_, i) => i)
      : (keypad?.values ?? []);

  const teamANumberOptions =
    keypad?.mode !== 'PAIRED' && isTieBreak && !extraBallsPicker && !relaxedKeypad
      ? baseNumberOptions.filter((number) => number !== teamBScore)
      : baseNumberOptions;

  const teamBNumberOptions =
    keypad?.mode !== 'PAIRED' && isTieBreak && !extraBallsPicker && !relaxedKeypad
      ? baseNumberOptions.filter((number) => number !== teamAScore)
      : baseNumberOptions;

  const numberOptions = pickerTeam === 'teamB' ? teamBNumberOptions : teamANumberOptions;

  const handleNumberSelect = (number: number) => {
    if (!pickerTeam) return;
    const team = pickerTeam;
    setTeamScore(team, number);
    clearKeypadAdvance();
    keypadAdvanceTimerRef.current = globalThis.setTimeout(() => {
      keypadAdvanceTimerRef.current = null;
      const nextTeam = resolveKeypadTeamAfterPick({
        pickedTeam: team,
        firstPickDone: keypadFirstPickDoneRef.current,
        isPaired: keypad?.mode === 'PAIRED',
      });
      if (nextTeam) {
        keypadFirstPickDoneRef.current = true;
        setPickerTeam(nextTeam);
      } else {
        setPickerTeam(null);
      }
    }, KEYPAD_SELECTION_CONFIRM_MS);
  };

  const mainTitle = isSupplementalRow
    ? t('gameResults.extraSetTitle')
    : (rules.fixedNumberOfSets === 1 ? t('gameResults.matchResult') : t('gameResults.setResult')) +
      (entryMode === 'SUPER_TIEBREAK'
        ? ` · ${t('gameResults.superTieBreak')}`
        : kind === 'TIEBREAK_GAME'
          ? ` · ${t('gameResults.tieBreak')}`
          : '');

  const exampleList = useMemo(
    () => getScoreEntryExampleList(rules, hintKind, isAutomaticRelaxed ? entryMode : null),
    [rules, hintKind, isAutomaticRelaxed, entryMode],
  );

  const descriptionLine = useMemo(() => {
    const parts: string[] = [];
    if (roundNumber != null && roundNumber > 0) {
      parts.push(t('gameResults.roundNumber', { number: roundNumber }));
    }
    if (entryMode === 'SUPER_TIEBREAK') {
      parts.push(t('gameResults.scoreEntryTiebreakPointsShort'));
      if (exampleList) {
        parts.push(t('gameResults.scoreEntryExampleLabel', { examples: exampleList }));
      }
    } else if (isAutomaticRelaxed && entryMode === 'AMERICANO_POINTS') {
      parts.push(t('gameResults.scoreEntryModeAmericanoPoints'));
      if (exampleList) {
        parts.push(t('gameResults.scoreEntryExampleLabel', { examples: exampleList }));
      }
    } else if (entryMode === 'GAMES') {
      parts.push(t('gameResults.scoreEntryGamesInSetShort'));
      const cap = game?.matchTimedCapMinutes;
      if (cap != null && cap >= 1) {
        parts.push(t('gameResults.classicTimedTimerMinutes', { minutes: cap }));
      }
      if (exampleList) {
        parts.push(t('gameResults.scoreEntryExampleLabel', { examples: exampleList }));
      }
    } else if (
      !isAutomaticRelaxed &&
      isClassicTimedRelaxedGameScores(rules) &&
      kind === 'REGULAR'
    ) {
      parts.push(t('gameResults.scoreEntryGamesInSetShort'));
      const cap = game?.matchTimedCapMinutes;
      if (cap != null && cap >= 1) {
        parts.push(t('gameResults.classicTimedTimerMinutes', { minutes: cap }));
      }
      if (exampleList) {
        parts.push(t('gameResults.scoreEntryExampleLabel', { examples: exampleList }));
      }
    } else if (
      isClassicTimedRelaxedGameScores(rules) &&
      (kind === 'TIEBREAK_GAME' || kind === 'SUPER_TIEBREAK')
    ) {
      parts.push(t('gameResults.scoreEntryTiebreakPointsShort'));
      if (exampleList) {
        parts.push(t('gameResults.scoreEntryExampleLabel', { examples: exampleList }));
      }
    } else if (exampleList) {
      parts.push(t('gameResults.scoreEntryExamples', { examples: exampleList }));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [
    roundNumber,
    exampleList,
    t,
    rules,
    kind,
    game?.matchTimedCapMinutes,
    isAutomaticRelaxed,
    entryMode,
  ]);

  const showScoreValidation =
    !recommendation.ok && Boolean(recommendation.reason) && (teamAScore > 0 || teamBScore > 0);
  const saveDisabled = !isAutomaticRelaxed && !validation.ok && (teamAScore > 0 || teamBScore > 0);

  return {
    rules,
    isSupplementalRow,
    isAutomaticRelaxed,
    extraRole,
    setExtraRole,
    teamAScore,
    teamBScore,
    setTeamScore,
    matchRecordMode,
    setMatchRecordMode,
    persistedRecordMode,
    canUseSuperTiebreak,
    useSuperTiebreak,
    setUseSuperTiebreak,
    pickerTeam,
    setPickerTeam,
    scoreMax,
    scorePickerKeypadMax,
    clampToAllowed,
    numberOptions,
    teamANumberOptions,
    teamBNumberOptions,
    handleNumberSelect,
    recommendation,
    suggestions,
    applySuggestion,
    handleSave,
    handleRemove,
    teamAPlayers,
    teamBPlayers,
    mainTitle,
    descriptionLine,
    showScoreValidation,
    saveDisabled,
  };
}
