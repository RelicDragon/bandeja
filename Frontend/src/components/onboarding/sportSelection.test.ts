import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import {
  canContinueFromSportStep,
  makeSportPrimary,
  resolveSubmittedPrimary,
  toggleSport,
  type SportSelection,
} from './sportSelection';

const empty: SportSelection = { selected: [], primary: null };

describe('sport step selection', () => {
  it('keeps Continue disabled until something is selected', () => {
    expect(canContinueFromSportStep(empty)).toBe(false);
    expect(canContinueFromSportStep(toggleSport(empty, Sports.PADEL))).toBe(true);
  });

  it('makes the first tap the primary', () => {
    const first = toggleSport(empty, Sports.TENNIS);
    expect(first.primary).toBe(Sports.TENNIS);

    const second = toggleSport(first, Sports.PADEL);
    expect(second.selected).toEqual([Sports.TENNIS, Sports.PADEL]);
    expect(second.primary).toBe(Sports.TENNIS);
  });

  it('moves the Primary tag on long-press / Make primary', () => {
    const state = makeSportPrimary(toggleSport(toggleSport(empty, Sports.TENNIS), Sports.PADEL), Sports.PADEL);
    expect(state.primary).toBe(Sports.PADEL);
    expect(state.selected).toEqual([Sports.TENNIS, Sports.PADEL]);
  });

  it('selects a sport that was not selected when it is made primary', () => {
    const state = makeSportPrimary(empty, Sports.SQUASH);
    expect(state.selected).toEqual([Sports.SQUASH]);
    expect(state.primary).toBe(Sports.SQUASH);
  });

  it('hands the tag on when the primary is deselected', () => {
    const two = toggleSport(toggleSport(empty, Sports.TENNIS), Sports.PADEL);
    const after = toggleSport(two, Sports.TENNIS);
    expect(after.selected).toEqual([Sports.PADEL]);
    expect(after.primary).toBe(Sports.PADEL);
  });

  it('clears the tag when nothing is left', () => {
    const one = toggleSport(empty, Sports.BADMINTON);
    const none = toggleSport(one, Sports.BADMINTON);
    expect(none.selected).toEqual([]);
    expect(none.primary).toBeNull();
    expect(canContinueFromSportStep(none)).toBe(false);
  });

  it('never submits a primary that is not selected', () => {
    expect(resolveSubmittedPrimary(empty)).toBeNull();
    // A stale primary from a previous profile falls back to the first pick.
    const stale: SportSelection = { selected: [Sports.PADEL], primary: Sports.SQUASH };
    expect(resolveSubmittedPrimary(stale)).toBe(Sports.PADEL);
  });
});
