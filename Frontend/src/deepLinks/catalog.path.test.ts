import { describe, expect, it } from 'vitest';
import {
  FIND_TODAY_PATH,
  FIND_TOMORROW_PATH,
  buildFindPath,
  buildGameChatPath,
  buildGameLivePath,
  buildGamePath,
  deepLinkTemplatePath,
  isFindTodayPath,
  resolveFindDeepLinkTarget,
} from './catalog';

describe('buildFindPath', () => {
  it('defaults to calendar view only', () => {
    expect(buildFindPath()).toBe('/find?view=calendar');
  });

  it('matches locked findToday / findTomorrow paths', () => {
    expect(buildFindPath({ view: 'calendar', dayOffset: 0 })).toBe(FIND_TODAY_PATH);
    expect(buildFindPath({ view: 'calendar', dayOffset: 1 })).toBe(FIND_TOMORROW_PATH);
  });

  it('prefers explicit date over dayOffset', () => {
    expect(
      buildFindPath({ view: 'calendar', date: '2026-08-01', dayOffset: 2 }),
    ).toBe('/find?view=calendar&date=2026-08-01');
  });
});

describe('game path templates', () => {
  it('builds game / chat / live paths from catalog templates', () => {
    expect(buildGamePath('abc')).toBe('/games/abc');
    expect(buildGameChatPath('abc')).toBe('/games/abc/chat');
    expect(buildGameLivePath('abc')).toBe('/games/abc/live');
    expect(deepLinkTemplatePath('game', 'x')).toBe('/games/x');
  });
});

describe('isFindTodayPath / resolveFindDeepLinkTarget', () => {
  it('accepts locked path and reordered query', () => {
    expect(isFindTodayPath(FIND_TODAY_PATH)).toBe(true);
    expect(isFindTodayPath('/find?dayOffset=0&view=calendar')).toBe(true);
    expect(resolveFindDeepLinkTarget('/find', '?dayOffset=0&view=calendar')).toBe(
      FIND_TODAY_PATH,
    );
  });

  it('rejects extras, wrong values, bare find', () => {
    expect(isFindTodayPath('/find')).toBe(false);
    expect(isFindTodayPath('/find?view=calendar')).toBe(false);
    expect(isFindTodayPath('/find?view=calendar&dayOffset=1')).toBe(false);
    expect(isFindTodayPath('/find?view=list&dayOffset=0')).toBe(false);
    expect(isFindTodayPath('/find?view=calendar&dayOffset=0&tab=search')).toBe(false);
    expect(resolveFindDeepLinkTarget('/find', '?view=calendar&dayOffset=1')).toBe(
      '/find?view=calendar&dayOffset=1',
    );
    expect(resolveFindDeepLinkTarget('/find', '')).toBe('/find');
  });
});
