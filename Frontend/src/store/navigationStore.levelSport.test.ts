import { describe, it, expect, beforeEach } from 'vitest';
import { Sports } from '@shared/sport';
import { useNavigationStore } from './navigationStore';

describe('navigationStore level sport stack', () => {
  beforeEach(() => {
    useNavigationStore.setState({
      activeLevelSport: undefined,
      levelSportStack: [],
    });
  });

  it('tracks innermost sport on push and restores on pop', () => {
    const { pushActiveLevelSport, popActiveLevelSport } = useNavigationStore.getState();
    pushActiveLevelSport(Sports.PADEL);
    pushActiveLevelSport(Sports.TENNIS);
    expect(useNavigationStore.getState().activeLevelSport).toBe(Sports.TENNIS);

    popActiveLevelSport(Sports.TENNIS);
    expect(useNavigationStore.getState().activeLevelSport).toBe(Sports.PADEL);

    popActiveLevelSport(Sports.PADEL);
    expect(useNavigationStore.getState().activeLevelSport).toBeUndefined();
    expect(useNavigationStore.getState().levelSportStack).toHaveLength(0);
  });

  it('supports duplicate sport entries for nested providers', () => {
    const { pushActiveLevelSport, popActiveLevelSport } = useNavigationStore.getState();
    pushActiveLevelSport(Sports.TENNIS);
    pushActiveLevelSport(Sports.TENNIS);
    expect(useNavigationStore.getState().levelSportStack).toHaveLength(2);

    popActiveLevelSport(Sports.TENNIS);
    expect(useNavigationStore.getState().activeLevelSport).toBe(Sports.TENNIS);
    expect(useNavigationStore.getState().levelSportStack).toHaveLength(1);
  });
});
