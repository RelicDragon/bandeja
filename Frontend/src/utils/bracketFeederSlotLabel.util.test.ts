import { describe, expect, it } from 'vitest';
import type { BracketSlotDto } from '@/api/leagues';
import {
  bracketMatchSlotLabel,
  resolveBracketSideDisplayLabel,
  resolveFeederSlotLabel,
} from './bracketFeederSlotLabel.util';
import { slotsById } from './leagueBracketLayout';

function slot(partial: Partial<BracketSlotDto> & Pick<BracketSlotDto, 'id' | 'slotKind'>): BracketSlotDto {
  return {
    slotKey: partial.id,
    phaseIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    ...partial,
  };
}

describe('bracketFeederSlotLabel.util', () => {
  it('labels feeder slots as QF1–QF4 and SF1–SF2', () => {
    const slots: BracketSlotDto[] = [
      slot({
        id: 'qf0',
        slotKind: 'MAIN',
        roundIndex: 0,
        matchIndex: 0,
        roundLabel: 'Quarterfinals',
      }),
      slot({
        id: 'qf3',
        slotKind: 'MAIN',
        roundIndex: 0,
        matchIndex: 3,
        roundLabel: 'Quarterfinals',
      }),
      slot({
        id: 'sf1',
        slotKind: 'MAIN',
        roundIndex: 1,
        matchIndex: 1,
        roundLabel: 'Semifinals',
      }),
      slot({
        id: 'fin',
        slotKind: 'MAIN',
        roundIndex: 2,
        matchIndex: 0,
        roundLabel: 'Final',
        feederSlotAId: 'sf0',
        feederSlotBId: 'sf1',
      }),
      slot({
        id: 'sf0',
        slotKind: 'MAIN',
        roundIndex: 1,
        matchIndex: 0,
        roundLabel: 'Semifinals',
      }),
    ];
    const lookup = slotsById(slots);
    expect(bracketMatchSlotLabel(slots[0])).toBe('QF1');
    expect(bracketMatchSlotLabel(slots[1])).toBe('QF4');
    expect(bracketMatchSlotLabel(slots[2])).toBe('SF2');
    expect(resolveFeederSlotLabel('qf0', lookup)).toBe('QF1');
    expect(resolveFeederSlotLabel('sf1', lookup)).toBe('SF2');
  });

  it('shows feeder label when participant is not resolved', () => {
    const slots: BracketSlotDto[] = [
      slot({
        id: 'qf2',
        slotKind: 'MAIN',
        roundIndex: 0,
        matchIndex: 2,
        roundLabel: 'Quarterfinals',
      }),
      slot({
        id: 'fin',
        slotKind: 'MAIN',
        roundIndex: 2,
        matchIndex: 0,
        roundLabel: 'Final',
        feederSlotBId: 'sf1',
      }),
      slot({
        id: 'sf1',
        slotKind: 'MAIN',
        roundIndex: 1,
        matchIndex: 1,
        roundLabel: 'Semifinals',
        feederSlotAId: 'qf2',
      }),
    ];
    const lookup = slotsById(slots);
    const fin = lookup.get('fin')!;
    expect(resolveBracketSideDisplayLabel(null, fin.feederSlotBId, lookup)).toBe('SF2');
    expect(resolveBracketSideDisplayLabel(null, fin.feederSlotAId, lookup)).toBeNull();
  });
});
