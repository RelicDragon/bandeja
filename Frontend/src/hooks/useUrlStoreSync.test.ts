import { describe, it, expect } from 'vitest';
import { homeSubTabFromParams } from './useUrlStoreSync';
import { parseLocation } from '@/utils/urlSchema';
import { parseQuickShortcutParam } from '@/components/home/findQuickShortcuts';

describe('homeSubTabFromParams', () => {
  it('defaults to calendar when tab is missing', () => {
    expect(homeSubTabFromParams(undefined)).toBe('calendar');
  });

  it('maps past-games query param', () => {
    expect(homeSubTabFromParams('past-games')).toBe('past-games');
  });

  it('falls back to calendar for legacy list tab', () => {
    expect(homeSubTabFromParams('list')).toBe('calendar');
  });

  it('falls back to calendar for legacy advanced tab', () => {
    expect(homeSubTabFromParams('advanced')).toBe('calendar');
  });

  it('falls back to calendar for unknown tab values', () => {
    expect(homeSubTabFromParams('search')).toBe('calendar');
  });
});

describe('parseLocation home tab', () => {
  it('derives sub-tab from ?tab= query param', () => {
    expect(homeSubTabFromParams(parseLocation('/', '?tab=advanced').params.tab as string)).toBe('calendar');
    expect(homeSubTabFromParams(parseLocation('/', '?tab=past-games').params.tab as string)).toBe('past-games');
    expect(homeSubTabFromParams(parseLocation('/', '?tab=list').params.tab as string)).toBe('calendar');
    expect(homeSubTabFromParams(parseLocation('/', '').params.tab as string)).toBe('calendar');
  });
});

describe('PRD 358 — ?quick= on Find', () => {
  it('reaches the parser through parseLocation and only accepts known kinds', () => {
    expect(parseQuickShortcutParam(parseLocation('/find', '?quick=tomorrow').params.quick)).toBe(
      'tomorrow',
    );
    expect(
      parseQuickShortcutParam(parseLocation('/find', '?view=list&quick=weekend').params.quick),
    ).toBe('weekend');
    expect(parseQuickShortcutParam(parseLocation('/find', '?quick=nope').params.quick)).toBeNull();
    expect(parseQuickShortcutParam(parseLocation('/find', '').params.quick)).toBeNull();
  });
});
