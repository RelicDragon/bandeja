import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game, GameSetupParams, GameType, ScoringMode, ScoringPreset, MatchGenerationType } from '@/types';
import {
  buildSetupFromFormat,
  detectScoringPreset,
  detectScoringMode,
  deriveGameType,
  DEFAULT_PRESET_BY_MODE,
  DEFAULT_GENERATION_BY_MODE,
  defaultMatchGenerationForParticipants,
  getScoringPresetConfig,
  getCompatibleScorings,
} from '@/utils/gameFormat';
import { getGameTypeTemplate } from '@/utils/gameTypeTemplates';

export interface UseGameFormatResult {
  scoringMode: ScoringMode;
  scoringPreset: ScoringPreset;
  generationType: MatchGenerationType;
  hasGoldenPoint: boolean;
  pointsPerWin: number;
  pointsPerLoose: number;
  pointsPerTie: number;
  winnerOfGame: GameSetupParams['winnerOfGame'];
  prohibitMatchesEditing: boolean;
  overrides: Partial<GameSetupParams>;
  /** Custom points total when user enters a non-standard value (POINTS mode only). */
  customPointsTotal: number | null;
  /** Match ends when clock runs out (simple points or tennis-style one set). */
  isTimed: boolean;
  /** 1–60; used when `isTimed`. */
  matchTimedCapMinutes: number;
  /** Derived — do not use as wizard selection */
  gameType: GameType;
  setupPayload: GameSetupParams;
  setScoringMode: (mode: ScoringMode) => void;
  setScoringPreset: (preset: ScoringPreset) => void;
  setGenerationType: (gen: MatchGenerationType) => void;
  setHasGoldenPoint: (v: boolean) => void;
  setCustomPointsTotal: (n: number | null) => void;
  setMatchTimedCap: (v: boolean) => void;
  setMatchTimedCapMinutes: (n: number) => void;
  setRanking: (patch: Partial<Pick<UseGameFormatResult, 'pointsPerWin' | 'pointsPerLoose' | 'pointsPerTie' | 'winnerOfGame' | 'prohibitMatchesEditing'>>) => void;
  setOverrides: (patch: Partial<GameSetupParams>) => void;
  resetOverrides: () => void;
}

export const useGameFormat = (initial?: Partial<Game>): UseGameFormatResult => {
  const initialPreset = detectScoringPreset(initial) ?? 'CLASSIC_BEST_OF_3';
  const initialMode: ScoringMode = detectScoringMode(initial);
  const maxParticipants = initial?.maxParticipants;

  const initialGameType = (initial?.gameType as GameType) || 'CLASSIC';
  const rawInitialGeneration: MatchGenerationType =
    (initial?.matchGenerationType as MatchGenerationType) ??
    getGameTypeTemplate(initialGameType).matchGenerationType ??
    DEFAULT_GENERATION_BY_MODE[initialMode];
  const initialGeneration = defaultMatchGenerationForParticipants(
    initialMode,
    maxParticipants,
    rawInitialGeneration,
  );

  const [scoringMode, setScoringModeState] = useState<ScoringMode>(initialMode);
  const [scoringPreset, setScoringPresetState] = useState<ScoringPreset>(initialPreset);
  const [generationType, setGenerationTypeState] = useState<MatchGenerationType>(initialGeneration);
  const [hasGoldenPoint, setHasGoldenPoint] = useState<boolean>(() =>
    initialMode === 'POINTS' ? false : Boolean(initial?.hasGoldenPoint),
  );
  const [customPointsTotal, setCustomPointsTotalState] = useState<number | null>(null);

  const classicBeforeTimedRef = useRef<ScoringPreset>('CLASSIC_BEST_OF_3');
  const pointsBeforeTimedRef = useRef<ScoringPreset>('POINTS_16');

  useEffect(() => {
    if (scoringMode === 'CLASSIC' && scoringPreset !== 'CLASSIC_TIMED' && scoringPreset.startsWith('CLASSIC_')) {
      classicBeforeTimedRef.current = scoringPreset;
    }
    if (scoringMode === 'POINTS' && scoringPreset !== 'TIMED' && scoringPreset.startsWith('POINTS_')) {
      pointsBeforeTimedRef.current = scoringPreset;
    }
  }, [scoringMode, scoringPreset]);

  useEffect(() => {
    if (maxParticipants == null) return;
    setGenerationTypeState((prev) => defaultMatchGenerationForParticipants(scoringMode, maxParticipants, prev));
  }, [maxParticipants, scoringMode]);

  useEffect(() => {
    if (scoringMode === 'POINTS' && hasGoldenPoint) setHasGoldenPoint(false);
  }, [scoringMode, hasGoldenPoint]);

  const derivedGameType = useMemo(
    () => deriveGameType(scoringMode, generationType),
    [scoringMode, generationType],
  );
  const template = useMemo(() => getGameTypeTemplate(derivedGameType), [derivedGameType]);

  const [pointsPerWin, setPointsPerWin] = useState<number>(initial?.pointsPerWin ?? template.pointsPerWin ?? 0);
  const [pointsPerLoose, setPointsPerLoose] = useState<number>(initial?.pointsPerLoose ?? template.pointsPerLoose ?? 0);
  const [pointsPerTie, setPointsPerTie] = useState<number>(initial?.pointsPerTie ?? template.pointsPerTie ?? 0);
  const [winnerOfGame, setWinnerOfGame] = useState<GameSetupParams['winnerOfGame']>(
    initial?.winnerOfGame ?? template.winnerOfGame,
  );
  const [prohibitMatchesEditing, setProhibitMatchesEditing] = useState<boolean>(
    initial?.prohibitMatchesEditing ?? false,
  );

  const [overrides, setOverridesState] = useState<Partial<GameSetupParams>>({});

  const initialTimedCap = (() => {
    const m = initial?.matchTimedCapMinutes;
    if (typeof m === 'number' && m >= 1 && m <= 60) return m;
    return 15;
  })();
  const [matchTimedCapMinutes, setMatchTimedCapMinutesState] = useState<number>(initialTimedCap);

  const isTimed = scoringPreset === 'TIMED' || scoringPreset === 'CLASSIC_TIMED';

  const setScoringMode = useCallback((mode: ScoringMode) => {
    setScoringModeState(mode);
    if (mode === 'POINTS') setHasGoldenPoint(false);
    setScoringPresetState(DEFAULT_PRESET_BY_MODE[mode]);
    setCustomPointsTotalState(null);
    setGenerationTypeState((prev) => {
      const nextGen = defaultMatchGenerationForParticipants(mode, maxParticipants, prev);
      const tmpl = getGameTypeTemplate(deriveGameType(mode, nextGen));
      setWinnerOfGame(tmpl.winnerOfGame);
      setPointsPerWin(tmpl.pointsPerWin ?? 0);
      setPointsPerLoose(tmpl.pointsPerLoose ?? 0);
      setPointsPerTie(tmpl.pointsPerTie ?? 0);
      return nextGen;
    });
    setOverridesState({});
  }, [maxParticipants]);

  const setScoringPreset = useCallback((preset: ScoringPreset) => {
    setScoringPresetState(preset);
    setCustomPointsTotalState(null);
    setOverridesState({});
  }, []);

  const setCustomPointsTotal = useCallback((n: number | null) => {
    setCustomPointsTotalState(n);
    if (n != null) {
      setScoringPresetState('POINTS_16');
    }
    setOverridesState({});
  }, []);

  const setMatchTimedCap = useCallback(
    (v: boolean) => {
      if (scoringMode === 'CLASSIC') {
        if (v) {
          setScoringPresetState('CLASSIC_TIMED');
          setMatchTimedCapMinutesState((prev) => (prev >= 1 && prev <= 60 ? prev : 15));
        } else setScoringPresetState(classicBeforeTimedRef.current);
      } else if (v) {
        setCustomPointsTotalState(null);
        setScoringPresetState('TIMED');
        setMatchTimedCapMinutesState((prev) => (prev >= 1 && prev <= 60 ? prev : 15));
      } else {
        setScoringPresetState(pointsBeforeTimedRef.current);
      }
      setOverridesState({});
    },
    [scoringMode],
  );

  const setMatchTimedCapMinutes = useCallback((n: number) => {
    if (!Number.isFinite(n)) return;
    setMatchTimedCapMinutesState(Math.min(60, Math.max(1, Math.round(n))));
    setOverridesState({});
  }, []);

  const setGenerationType = useCallback((gen: MatchGenerationType) => {
    setGenerationTypeState(gen);
    const newGameType = deriveGameType(scoringMode, gen);
    const tmpl = getGameTypeTemplate(newGameType);
    setWinnerOfGame(tmpl.winnerOfGame);
    setPointsPerWin(tmpl.pointsPerWin ?? 0);
    setPointsPerLoose(tmpl.pointsPerLoose ?? 0);
    setPointsPerTie(tmpl.pointsPerTie ?? 0);
    setOverridesState({});
  }, [scoringMode]);

  const setRanking = useCallback<UseGameFormatResult['setRanking']>((patch) => {
    if (patch.pointsPerWin !== undefined) setPointsPerWin(patch.pointsPerWin);
    if (patch.pointsPerLoose !== undefined) setPointsPerLoose(patch.pointsPerLoose);
    if (patch.pointsPerTie !== undefined) setPointsPerTie(patch.pointsPerTie);
    if (patch.winnerOfGame !== undefined) setWinnerOfGame(patch.winnerOfGame);
    if (patch.prohibitMatchesEditing !== undefined) setProhibitMatchesEditing(patch.prohibitMatchesEditing);
  }, []);

  const setOverrides = useCallback((patch: Partial<GameSetupParams>) => {
    setOverridesState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetOverrides = useCallback(() => setOverridesState({}), []);

  const setupPayload = useMemo<GameSetupParams>(() => {
    return buildSetupFromFormat({
      scoringMode,
      scoringPreset,
      generationType,
      hasGoldenPoint,
      pointsPerWin,
      pointsPerLoose,
      pointsPerTie,
      winnerOfGame,
      prohibitMatchesEditing,
      customPointsTotal,
      matchTimedCapMinutes,
      overrides,
    });
  }, [scoringMode, scoringPreset, generationType, hasGoldenPoint, pointsPerWin, pointsPerLoose, pointsPerTie, winnerOfGame, prohibitMatchesEditing, customPointsTotal, matchTimedCapMinutes, overrides]);

  return {
    scoringMode,
    scoringPreset,
    generationType,
    hasGoldenPoint,
    pointsPerWin,
    pointsPerLoose,
    pointsPerTie,
    winnerOfGame,
    prohibitMatchesEditing,
    overrides,
    customPointsTotal,
    isTimed,
    matchTimedCapMinutes,
    gameType: derivedGameType,
    setupPayload,
    setScoringMode,
    setScoringPreset,
    setGenerationType,
    setHasGoldenPoint,
    setCustomPointsTotal,
    setMatchTimedCap,
    setMatchTimedCapMinutes,
    setRanking,
    setOverrides,
    resetOverrides,
  };
};

export { getCompatibleScorings, getScoringPresetConfig };
