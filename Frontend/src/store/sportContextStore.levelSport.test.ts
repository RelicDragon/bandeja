import { describe, it, expect, beforeEach } from 'vitest';
import { Sports } from '@shared/sport';
import { useSportContextStore } from './sportContextStore';

describe('sportContextStore level sport stack', () => {
  beforeEach(() => {
    useSportContextStore.setState({
      activeLevelSport: undefined,
      levelSportStack: [],
    });
  });

  it('tracks innermost sport on push and restores on pop', () => {
    const { pushActiveLevelSport, popActiveLevelSport } = useSportContextStore.getState();
    pushActiveLevelSport(Sports.PADEL);
    pushActiveLevelSport(Sports.TENNIS);
    expect(useSportContextStore.getState().activeLevelSport).toBe(Sports.TENNIS);

    popActiveLevelSport(Sports.TENNIS);
    expect(useSportContextStore.getState().activeLevelSport).toBe(Sports.PADEL);

    popActiveLevelSport(Sports.PADEL);
    expect(useSportContextStore.getState().activeLevelSport).toBeUndefined();
    expect(useSportContextStore.getState().levelSportStack).toHaveLength(0);
  });

  it('supports duplicate sport entries for nested providers', () => {
    const { pushActiveLevelSport, popActiveLevelSport } = useSportContextStore.getState();
    pushActiveLevelSport(Sports.TENNIS);
    pushActiveLevelSport(Sports.TENNIS);
    expect(useSportContextStore.getState().levelSportStack).toHaveLength(2);

    popActiveLevelSport(Sports.TENNIS);
    expect(useSportContextStore.getState().activeLevelSport).toBe(Sports.TENNIS);
    expect(useSportContextStore.getState().levelSportStack).toHaveLength(1);
  });
});
