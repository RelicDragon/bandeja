import { describe, expect, it } from 'vitest';
import { fitLiveSchematicSize, SCHEMATIC_SIDE_GAP_PX, SCHEMATIC_SIDE_RAIL_PX } from './liveSchematicFit';

describe('fitLiveSchematicSize', () => {
  it('fits court-only schematic in container', () => {
    const s = fitLiveSchematicSize(320, 400, 61, 134, false);
    expect(s).not.toBeNull();
    expect(s!.totalW).toBe(s!.courtW);
    expect(s!.totalH).toBe(s!.courtH);
    expect(s!.totalW).toBeLessThanOrEqual(320);
    expect(s!.totalH).toBeLessThanOrEqual(400);
  });

  it('reserves width for change-ends rails', () => {
    const rails = fitLiveSchematicSize(300, 500, 61, 134, true)!;
    const gutter = SCHEMATIC_SIDE_RAIL_PX * 2 + SCHEMATIC_SIDE_GAP_PX * 2;
    expect(rails.totalW).toBeLessThanOrEqual(300);
    expect(rails.totalW - rails.courtW).toBe(gutter);
  });
});
