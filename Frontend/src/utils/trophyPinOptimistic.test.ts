import { describe, expect, it } from 'vitest';
import {
  applyOptimisticPin,
  applyOptimisticUnpin,
} from '@/utils/trophyPinOptimistic';
import type { TrophiesPayload } from '@/types/trophies';

function baseTrophies(): TrophiesPayload {
  const instance = {
    id: 'inst-1',
    definitionId: 'habit_first_win',
    earnedAt: '2026-07-01T00:00:00.000Z',
    sport: null,
    place: null,
    source: null,
  };
  const definition = {
    id: 'habit_first_win',
    rarity: 'COMMON' as const,
    artKey: 'habit_first_win',
    ruleKind: 'HABIT_FIRST_WIN',
    titleKey: 'trophies.defs.firstWin.title',
    descriptionKey: 'trophies.defs.firstWin.description',
    type: 'MILESTONE',
  };
  return {
    showcase: [
      { slot: 0, pinned: false, definition, instance, instances: [instance] },
      { slot: 1, pinned: false, definition: null, instance: null, instances: [] },
      { slot: 2, pinned: false, definition: null, instance: null, instances: [] },
    ],
    cabinet: [
      {
        definition,
        unlocked: true,
        instances: [instance],
        progress: null,
      },
    ],
    pinsEditable: true,
    pinnedInstanceIds: [],
    unlockedCount: 1,
  };
}

describe('trophyPinOptimistic', () => {
  it('pins and unpins with showcase rebuild', () => {
    const pinned = applyOptimisticPin(baseTrophies(), 'inst-1', 0);
    expect(pinned.pinnedInstanceIds).toEqual(['inst-1']);
    expect(pinned.showcase[0]?.pinned).toBe(true);
    expect(pinned.showcase[0]?.instance?.id).toBe('inst-1');

    const unpinned = applyOptimisticUnpin(pinned, 'inst-1');
    expect(unpinned.pinnedInstanceIds).toEqual([]);
    expect(unpinned.showcase[0]?.pinned).toBe(false);
    expect(unpinned.showcase[0]?.instance?.id).toBe('inst-1');
  });
});
