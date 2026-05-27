import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import {
  resolveBracketRoundPickerLabel,
  resolveBracketRoundTitleFromSlots,
  translateBracketRoundLabel,
} from './bracketRoundDisplay.util';

function slot(partial: Partial<BracketSlotDto> & Pick<BracketSlotDto, 'id' | 'slotKind'>): BracketSlotDto {
  return {
    slotKey: partial.id,
    phaseIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    ...partial,
  };
}

describe('resolveBracketRoundTitleFromSlots', () => {
  it('returns latest main round label when present', () => {
    const slots = [
      slot({ id: 'a', slotKind: 'MAIN', roundIndex: 0, roundLabel: 'Quarterfinals' }),
      slot({ id: 'b', slotKind: 'MAIN', roundIndex: 1, roundLabel: 'Semifinals' }),
      slot({ id: 'c', slotKind: 'MAIN', roundIndex: 2, roundLabel: 'Final' }),
    ];
    expect(resolveBracketRoundTitleFromSlots(slots)).toBe('Final');
  });

  it('falls back to any slot roundLabel', () => {
    const slots = [slot({ id: 'p', slotKind: 'PLAY_IN', roundIndex: 0, roundLabel: 'Play-in' })];
    expect(resolveBracketRoundTitleFromSlots(slots)).toBe('Play-in');
  });

  it('returns null when no labels', () => {
    expect(resolveBracketRoundTitleFromSlots([slot({ id: 'a', slotKind: 'MAIN', roundIndex: 0 })])).toBeNull();
  });
});

describe('resolveBracketRoundPickerLabel', () => {
  it('uses slot-derived title when available', () => {
    const round = {
      id: 'r1',
      leagueSeasonId: 's1',
      orderIndex: 2,
      sentStartMessage: false,
      createdAt: '',
      updatedAt: '',
      games: [],
    };
    expect(resolveBracketRoundPickerLabel(round, 'Semifinals', 'Round 3')).toBe('Semifinals');
  });

  it('falls back to generic round label', () => {
    const round = {
      id: 'r1',
      leagueSeasonId: 's1',
      orderIndex: 0,
      sentStartMessage: false,
      createdAt: '',
      updatedAt: '',
      games: [],
    };
    expect(resolveBracketRoundPickerLabel(round, null, 'Round 1')).toBe('Round 1');
  });
});

const mockT = (key: string, opts?: { round?: number }) => {
  const map: Record<string, string> = {
    'gameDetails.bracketRoundFinal': 'finále',
    'gameDetails.bracketRoundSemifinals': 'semifinále',
    'gameDetails.bracketRoundQuarterfinals': 'čtvrtfinále',
    'gameDetails.bracketRoundOf16': 'osmifinále',
    'gameDetails.bracketColumnPlayIn': 'Play-in',
    'gameDetails.bracketColumnThirdPlace': 'O 3. místo',
    'gameDetails.bracketTabGrandFinal': 'Velké finále',
    'gameDetails.bracketColumnMainRound': `Kolo ${opts?.round ?? ''}`,
    'gameDetails.bracketColumnByes': 'Volno',
  };
  return map[key] ?? key;
};

describe('translateBracketRoundLabel', () => {
  it('translates known knockout round labels', () => {
    expect(translateBracketRoundLabel('Quarterfinals', mockT)).toBe('čtvrtfinále');
    expect(translateBracketRoundLabel('Semifinals', mockT)).toBe('semifinále');
    expect(translateBracketRoundLabel('Final', mockT)).toBe('finále');
    expect(translateBracketRoundLabel('Round of 16', mockT)).toBe('osmifinále');
  });

  it('translates special round labels', () => {
    expect(translateBracketRoundLabel('Play-in', mockT)).toBe('Play-in');
    expect(translateBracketRoundLabel('Third place', mockT)).toBe('O 3. místo');
    expect(translateBracketRoundLabel('Grand final', mockT)).toBe('Velké finále');
  });

  it('translates Round N pattern', () => {
    expect(translateBracketRoundLabel('Round 2', mockT)).toBe('Kolo 2');
  });

  it('returns unknown labels unchanged', () => {
    expect(translateBracketRoundLabel('Custom round', mockT)).toBe('Custom round');
  });
});
