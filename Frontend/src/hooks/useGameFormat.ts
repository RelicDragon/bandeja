import { useCallback, useEffect, useMemo, useState } from 'react';
import { Game, GameSetupParams, GameType, ScoringMode, ScoringPreset, MatchGenerationType } from '@/types';
import {
  buildSetupFromFormat,
  detectScoringPreset,
  detectScoringMode,
  deriveGameType,
  DEFAULT_PRESET_BY_MODE,
  DEFAULT_GENERATION_BY_MODE,
  defaultMatchGenerationForParticipants,
  clampMatchGenerationType,
  effectiveMatchGeneration,
  getScoringPresetConfig,
  getCompatibleScorings,
} from '@/utils/gameFormat';
import { getGameTypeTemplate } from '@/utils/gameTypeTemplates';

function initialMatchTimerEnabled(game?: Partial<Game> | null): boolean {
  if (!game) return false;
  if (game.matchTimerEnabled) return true;
  return game.scoringPreset === 'TIMED' || game.scoringPreset === 'CLASSIC_TIMED';
}

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
  customPointsTotal: number | null;
  matchTimerEnabled: boolean;
  matchTimedCapMinutes: number;
  gameType: GameType;
  setupPayload: GameSetupParams;
  setScoringMode: (mode: ScoringMode) => void;
  setScoringPreset: (preset: ScoringPreset) => void;
  setGenerationType: (gen: MatchGenerationType) => void;
  setHasGoldenPoint: (v: boolean) => void;
  setCustomPointsTotal: (n: number | null) => void;
  setMatchTimerEnabled: (v: boolean) => void;
  setMatchTimedCapMinutes: (n: number) => void;
  setRanking: (patch: Partial<Pick<UseGameFormatResult, 'pointsPerWin' | 'pointsPerLoose' | 'pointsPerTie' | 'winnerOfGame' | 'prohibitMatchesEditing'>>) => void;
  setOverrides: (patch: Partial<GameSetupParams>) => void;
  resetOverrides: () => void;
}

export interface UseGameFormatOptions {
  skipGenerationParticipantDefaults?: boolean;
}

export const useGameFormat = (initial?: Partial<Game>, options?: UseGameFormatOptions): UseGameFormatResult => {
  const skipGenerationParticipantDefaults = options?.skipGenerationParticipantDefaults === true;
  const initialPreset = detectScoringPreset(initial) ?? 'CLASSIC_BEST_OF_3';
  const initialMode: ScoringMode = detectScoringMode(initial);
  const maxParticipants = initial?.maxParticipants;

  const initialGameType = (initial?.gameType as GameType) || 'CLASSIC';
  const rawInitialGeneration: MatchGenerationType =
    (initial?.matchGenerationType as MatchGenerationType) ??
    getGameTypeTemplate(initialGameType).matchGenerationType ??
    DEFAULT_GENERATION_BY_MODE[initialMode];
  const initialGeneration = skipGenerationParticipantDefaults
    ? clampMatchGenerationType(
        effectiveMatchGeneration(initialMode, rawInitialGeneration, maxParticipants),
        maxParticipants,
      )
    : defaultMatchGenerationForParticipants(initialMode, maxParticipants, rawInitialGeneration);

  const [scoringMode, setScoringModeState] = useState<ScoringMode>(initialMode);
  const [scoringPreset, setScoringPresetState] = useState<ScoringPreset>(initialPreset);
  const [generationType, setGenerationTypeState] = useState<MatchGenerationType>(initialGeneration);
  const [hasGoldenPoint, setHasGoldenPoint] = useState<boolean>(() =>
    initialMode === 'POINTS' ? false : Boolean(initial?.hasGoldenPoint),
  );
  const [customPointsTotal, setCustomPointsTotalState] = useState<number | null>(null);

  useEffect(() => {
    if (skipGenerationParticipantDefaults || maxParticipants == null) return;
    setGenerationTypeState((prev) => defaultMatchGenerationForParticipants(scoringMode, maxParticipants, prev));
  }, [skipGenerationParticipantDefaults, maxParticipants, scoringMode]);

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
  const [matchTimerEnabled, setMatchTimerEnabledState] = useState<boolean>(() => initialMatchTimerEnabled(initial));

  const setScoringMode = useCallback(
    (mode: ScoringMode) => {
      setScoringModeState(mode);
      if (mode === 'POINTS') setHasGoldenPoint(false);
      setScoringPresetState(DEFAULT_PRESET_BY_MODE[mode]);
      setCustomPointsTotalState(null);
      setMatchTimerEnabledState(false);
      setGenerationTypeState((prev) => {
        const nextGen = skipGenerationParticipantDefaults
          ? clampMatchGenerationType(effectiveMatchGeneration(mode, prev, maxParticipants), maxParticipants)
          : defaultMatchGenerationForParticipants(mode, maxParticipants, prev);
        const tmpl = getGameTypeTemplate(deriveGameType(mode, nextGen));
        setWinnerOfGame(tmpl.winnerOfGame);
        setPointsPerWin(tmpl.pointsPerWin ?? 0);
        setPointsPerLoose(tmpl.pointsPerLoose ?? 0);
        setPointsPerTie(tmpl.pointsPerTie ?? 0);
        return nextGen;
      });
      setOverridesState({});
    },
    [maxParticipants, skipGenerationParticipantDefaults],
  );

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

  const setMatchTimerEnabled = useCallback((v: boolean) => {
    setMatchTimerEnabledState(v);
    if (v) {
      setMatchTimedCapMinutesState((prev) => (prev >= 1 && prev <= 60 ? prev : 15));
    }
    setOverridesState({});
  }, []);

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

  useEffect(() => {
    if (!skipGenerationParticipantDefaults || maxParticipants == null) return;
    const next = clampMatchGenerationType(generationType, maxParticipants);
    if (next !== generationType) {
      setGenerationType(next);
      if (next === 'HANDMADE' || next === 'FIXED' || next === 'AUTOMATIC') {
        setRanking({ prohibitMatchesEditing: false });
      }
    }
  }, [
    skipGenerationParticipantDefaults,
    maxParticipants,
    generationType,
    setGenerationType,
    setRanking,
  ]);

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
      matchTimerEnabled,
      overrides,
    });
  }, [
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
    matchTimerEnabled,
    overrides,
  ]);

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
    matchTimerEnabled,
    matchTimedCapMinutes,
    gameType: derivedGameType,
    setupPayload,
    setScoringMode,
    setScoringPreset,
    setGenerationType,
    setHasGoldenPoint,
    setCustomPointsTotal,
    setMatchTimerEnabled,
    setMatchTimedCapMinutes,
    setRanking,
    setOverrides,
    resetOverrides,
  };
};

export { getCompatibleScorings, getScoringPresetConfig };
