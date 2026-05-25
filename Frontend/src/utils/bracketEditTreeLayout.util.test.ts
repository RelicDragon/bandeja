import { describe, expect, it } from 'vitest';
import type { BracketEditPosition } from './bracketSlotEdit.util';
import { buildBracketEditTreeColumns } from './bracketEditTreeLayout.util';

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

describe('bracketEditTreeLayout.util (UX-B10)', () => {
  it('groups edit positions into play-in, byes, and main columns', () => {
    const positions: BracketEditPosition[] = [
      pos({ key: 'pi:a', slotKind: 'PLAY_IN', slotId: 's1', side: 'A', roundIndex: 0 }),
      pos({ key: 'pi:b', slotKind: 'PLAY_IN', slotId: 's1', side: 'B', roundIndex: 0 }),
      pos({ key: 'bye:1', slotKind: 'BYE', seed: 1, roundIndex: 0 }),
      pos({ key: 'm:a', slotKind: 'MAIN', slotId: 's2', side: 'A', roundIndex: 0, roundLabel: 'QF' }),
      pos({ key: 'm:b', slotKind: 'MAIN', slotId: 's2', side: 'B', roundIndex: 0, roundLabel: 'QF' }),
    ];

    const columns = buildBracketEditTreeColumns(positions);
    expect(columns).toHaveLength(3);
    expect(columns[0]).toMatchObject({ kind: 'play-in', pairs: [[positions[0], positions[1]]] });
    expect(columns[1]).toMatchObject({ kind: 'byes', positions: [positions[2]] });
    expect(columns[2]).toMatchObject({ kind: 'main', roundLabel: 'QF', pairs: [[positions[3], positions[4]]] });
  });
});
