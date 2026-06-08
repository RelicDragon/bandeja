import { describe, expect, it } from 'vitest';
import type { BracketEditPosition } from '@/utils/bracketSlotEdit.util';
import { planBracketEdit } from './planBracketEdit';

function pos(partial: Partial<BracketEditPosition> & Pick<BracketEditPosition, 'key' | 'slotKind'>): BracketEditPosition {
  return {
    slotId: partial.slotId ?? partial.key,
    roundIndex: partial.roundIndex ?? 0,
    participantId: partial.participantId ?? 'p1',
    participant: partial.participant ?? null,
    locked: partial.locked ?? false,
    ...partial,
  };
}

describe('planBracketEdit', () => {
  it('returns invalidSwap when swap crosses edit phases', () => {
    const draft = [
      pos({ key: 'pi:a', slotKind: 'PLAY_IN', slotId: 's1', side: 'A', participantId: 'p1' }),
      pos({ key: 'm:a', slotKind: 'MAIN', slotId: 's2', side: 'A', roundIndex: 0, participantId: 'p2' }),
    ];
    const pool = new Map<string, NonNullable<BracketEditPosition['participant']>>();

    const result = planBracketEdit({
      mode: 'swap',
      draft,
      fromKey: 'pi:a',
      toKey: 'm:a',
      pool,
    });

    expect(result.validationErrors).toEqual(['invalidSwap']);
    expect(result.nextDraft).toBeUndefined();
  });

  it('builds patch payload on save when draft differs from baseline', () => {
    const baseline = [
      pos({ key: 'a', slotKind: 'MAIN', slotId: 's1', side: 'A', participantId: 'p1' }),
      pos({ key: 'b', slotKind: 'MAIN', slotId: 's1', side: 'B', participantId: 'p2' }),
    ];
    const draft = [
      { ...baseline[0], participantId: 'p2' },
      { ...baseline[1], participantId: 'p1' },
    ];

    const result = planBracketEdit({ mode: 'save', baseline, draft });

    expect(result.validationErrors).toEqual([]);
    expect(result.payload.length).toBeGreaterThan(0);
  });
});
