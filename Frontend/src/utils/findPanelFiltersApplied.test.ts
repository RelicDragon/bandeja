import { describe, expect, it } from 'vitest';
import { hasFindPanelFiltersApplied } from './findPanelFiltersApplied';

describe('hasFindPanelFiltersApplied', () => {
  it('is false for defaults', () => {
    expect(
      hasFindPanelFiltersApplied({
        filterAvailableSlots: false,
        filterSuitableRating: false,
        hideBarGames: false,
        filterClubIds: [],
        filterTimeStart: '00:00',
        filterTimeEnd: '24:00',
        filterLevelMin: 1,
        filterLevelMax: 7,
        filterNoRating: false,
        filterNoviceFriendly: false,
        showPrivateGames: false,
      }),
    ).toBe(false);
  });

  it('is true when any panel criterion is set', () => {
    expect(hasFindPanelFiltersApplied({ filterLevelMin: 2.5, filterLevelMax: 7 })).toBe(true);
    expect(hasFindPanelFiltersApplied({ filterAvailableSlots: true })).toBe(true);
    expect(hasFindPanelFiltersApplied({ filterClubIds: ['c1'] })).toBe(true);
    // PRD 360 — otherwise the panel collapses itself on the next Find mount and
    // the games the viewer is looking at stay filtered with no visible reason.
    expect(hasFindPanelFiltersApplied({ filterNoviceFriendly: true })).toBe(true);
  });
});
