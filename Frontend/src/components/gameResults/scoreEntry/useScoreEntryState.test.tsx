// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/types/gameResults';
import { useScoreEntryState, type ScoreEntryGame } from './useScoreEntryState';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const game: ScoreEntryGame = {
  sport: 'PADEL', scoringPreset: 'CLASSIC_AUTOMATIC', fixedNumberOfSets: 0,
  maxTotalPointsPerSet: 0, maxPointsPerTeam: 0, winnerOfMatch: 'BY_SETS',
  ballsInGames: true, deucesBeforeGoldenPoint: null, pointsPerTie: 0,
};

describe('regular score entry draft', () => {
  let root: Root;
  let container: HTMLDivElement;
  let entry: ReturnType<typeof useScoreEntryState>;
  let match: Match;
  const onSave = vi.fn();
  const onClose = vi.fn();

  function Probe({ currentMatch, currentGame, setIndex }: { currentMatch: Match; currentGame: ScoreEntryGame; setIndex: number }) {
    entry = useScoreEntryState({ match: currentMatch, game: currentGame, setIndex, players: [], onSave, onClose });
    return <output>{entry.teamAScore}:{entry.teamBScore}</output>;
  }

  function render(currentMatch = match, currentGame = game, setIndex = 0) {
    // Both production callers key the dialog by match and set, and unmount on close.
    act(() => root.render(<Probe key={`${currentMatch.id}-${setIndex}`} currentMatch={currentMatch} currentGame={currentGame} setIndex={setIndex} />));
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    container = document.createElement('div');
    root = createRoot(container);
    match = { id: 'match-1', resultsVersion: 'v0', teamA: [], teamB: [], sets: [{ teamA: 0, teamB: 0 }] };
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it('keeps typed scores across a parent game refresh and saves them', () => {
    render();
    act(() => entry.setTeamScore('teamA', 6));
    act(() => entry.setTeamScore('teamB', 4));
    expect(container.textContent).toBe('6:4');
    render(match, { ...game });
    expect(container.textContent).toBe('6:4');
    act(() => entry.handleSave());
    expect(onSave).toHaveBeenCalledWith('match-1', 0, 6, 4, false, undefined, { automaticRecordMode: 'GAMES', baseVersion: 'v0' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(['sets', 'metadata'] as const)('keeps scores when only %s is refreshed', (field) => {
    render();
    act(() => entry.setTeamScore('teamA', 6));
    const refreshed = field === 'sets'
      ? { ...match, sets: match.sets.map((set) => ({ ...set })) }
      : { ...match, metadata: {} };
    render(refreshed);
    expect(container.textContent).toBe('6:0');
  });

  it('keeps the selected automatic record mode and points across refreshes', () => {
    render();
    act(() => entry.setMatchRecordMode('AMERICANO_POINTS'));
    act(() => entry.setTeamScore('teamA', 24));
    act(() => entry.setTeamScore('teamB', 18));
    render({ ...match, metadata: {} }, { ...game });
    expect(entry.matchRecordMode).toBe('AMERICANO_POINTS');
    expect(container.textContent).toBe('24:18');
  });

  it('keeps super tiebreak selection and scores across refreshes', () => {
    match.sets = [{ teamA: 6, teamB: 4 }, { teamA: 4, teamB: 6 }, { teamA: 0, teamB: 0 }];
    render(match, game, 2);
    expect(entry.canUseSuperTiebreak).toBe(true);
    act(() => entry.setUseSuperTiebreak(true));
    act(() => entry.setTeamScore('teamA', 10));
    act(() => entry.setTeamScore('teamB', 8));
    render({ ...match, sets: [...match.sets] }, { ...game }, 2);
    expect(entry.useSuperTiebreak).toBe(true);
    expect(container.textContent).toBe('10:8');
    act(() => entry.handleSave());
    expect(onSave).toHaveBeenCalledWith('match-1', 2, 10, 8, true, undefined, { baseVersion: 'v0' });
  });

  it('keeps supplemental units and scores across refreshes', () => {
    match.sets = [{ teamA: 0, teamB: 0, role: 'EXTRA_GAMES' }];
    render();
    act(() => entry.setExtraRole('EXTRA_BALLS'));
    act(() => entry.setTeamScore('teamA', 3));
    render({ ...match, sets: [...match.sets] }, { ...game });
    expect(entry.extraRole).toBe('EXTRA_BALLS');
    expect(container.textContent).toBe('3:0');
    act(() => entry.handleSave());
    expect(onSave).toHaveBeenCalledWith('match-1', 0, 3, 0, false, 'EXTRA_BALLS', { baseVersion: 'v0' });
  });

  it('keeps keypad picks through a refresh between picking the two teams', () => {
    vi.useFakeTimers();
    render();
    act(() => entry.setPickerTeam('teamA'));
    act(() => entry.handleNumberSelect(6));
    render(match, { ...game });
    act(() => vi.runAllTimers());
    expect(entry.pickerTeam).toBe('teamB');
    act(() => entry.handleNumberSelect(4));
    render({ ...match, sets: [...match.sets] });
    act(() => vi.runAllTimers());
    expect(entry.pickerTeam).toBeNull();
    expect(container.textContent).toBe('6:4');
  });

  it('preserves edits over incoming scores, then loads the latest scores on reopen', () => {
    render();
    act(() => entry.setTeamScore('teamA', 6));
    const refreshed = { ...match, sets: [{ teamA: 2, teamB: 3 }] };
    render(refreshed);
    expect(container.textContent).toBe('6:0');
    act(() => root.render(null));
    render(refreshed);
    expect(container.textContent).toBe('2:3');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('initializes a fresh draft when switching match or set', () => {
    render();
    act(() => entry.setTeamScore('teamA', 6));
    const otherMatch = { ...match, id: 'match-2', sets: [{ teamA: 1, teamB: 2 }, { teamA: 3, teamB: 4 }] };
    render(otherMatch);
    expect(container.textContent).toBe('1:2');
    render(otherMatch, game, 1);
    expect(container.textContent).toBe('3:4');
  });

  it('keeps the opening version with an Automatic draft after a remote score refresh', () => {
    render();
    act(() => entry.setTeamScore('teamA', 6));
    act(() => entry.setTeamScore('teamB', 4));
    render({ ...match, resultsVersion: 'v1', sets: [{ teamA: 7, teamB: 5 }] });
    act(() => entry.handleSave());
    expect(onSave).toHaveBeenCalledWith('match-1', 0, 6, 4, false, undefined, {
      automaticRecordMode: 'GAMES', baseVersion: 'v0',
    });
  });

  it('preserves classic scores through refresh without bypassing score validation', () => {
    const classicGame: ScoreEntryGame = { ...game, scoringPreset: 'CLASSIC_BEST_OF_3' };
    render(match, classicGame);
    act(() => entry.setTeamScore('teamA', 6));
    act(() => entry.setTeamScore('teamB', 5));
    render(match, { ...classicGame });
    expect(container.textContent).toBe('6:5');
    expect(entry.saveDisabled).toBe(true);
    act(() => entry.handleSave());
    expect(onSave).not.toHaveBeenCalled();
    act(() => entry.setTeamScore('teamB', 4));
    act(() => entry.handleSave());
    expect(onSave).toHaveBeenCalledWith('match-1', 0, 6, 4, false, undefined, { baseVersion: 'v0' });
  });

  it('preserves paired point totals through refresh', () => {
    const pairedGame: ScoreEntryGame = {
      ...game, scoringPreset: null, ballsInGames: false, winnerOfMatch: 'BY_SCORES',
      fixedNumberOfSets: 1, maxTotalPointsPerSet: 32,
    };
    render(match, pairedGame);
    act(() => entry.setTeamScore('teamA', 20));
    expect(container.textContent).toBe('20:12');
    render({ ...match, sets: [...match.sets] }, { ...pairedGame });
    expect(container.textContent).toBe('20:12');
    act(() => entry.handleSave());
    expect(onSave).toHaveBeenCalledWith('match-1', 0, 20, 12, false, undefined, { baseVersion: 'v0' });
  });
});
