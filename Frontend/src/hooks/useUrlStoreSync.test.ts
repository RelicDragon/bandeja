import { describe, it, expect } from 'vitest';
import { homeSubTabFromParams } from './useUrlStoreSync';
import { parseLocation } from '@/utils/urlSchema';

describe('homeSubTabFromParams', () => {
  it('defaults to calendar when tab is missing', () => {
    expect(homeSubTabFromParams(undefined)).toBe('calendar');
  });

  it('maps advanced query param', () => {
    expect(homeSubTabFromParams('advanced')).toBe('advanced');
  });

  it('falls back to calendar for legacy past-games tab', () => {
    expect(homeSubTabFromParams('past-games')).toBe('calendar');
  });

  it('falls back to calendar for legacy list tab', () => {
    expect(homeSubTabFromParams('list')).toBe('calendar');
  });

  it('falls back to calendar for unknown tab values', () => {
    expect(homeSubTabFromParams('search')).toBe('calendar');
  });
});

describe('parseLocation home tab', () => {
  it('derives sub-tab from ?tab= query param', () => {
    expect(homeSubTabFromParams(parseLocation('/', '?tab=advanced').params.tab as string)).toBe('advanced');
    expect(homeSubTabFromParams(parseLocation('/', '?tab=list').params.tab as string)).toBe('calendar');
    expect(homeSubTabFromParams(parseLocation('/', '?tab=past-games').params.tab as string)).toBe('calendar');
    expect(homeSubTabFromParams(parseLocation('/', '').params.tab as string)).toBe('calendar');
  });
});
