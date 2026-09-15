import { describe, expect, it } from 'vitest';
import { findCityEventsRailLayout } from './findCityEventsRailLayout';

describe('findCityEventsRailLayout', () => {
  it('uses a full-width row for a single event', () => {
    expect(findCityEventsRailLayout(1)).toBe('row');
  });

  it('uses a carousel when more than one event is shown', () => {
    expect(findCityEventsRailLayout(2)).toBe('carousel');
    expect(findCityEventsRailLayout(3)).toBe('carousel');
  });
});
