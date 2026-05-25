import { describe, expect, it } from 'vitest';
import {
  applyBracketExportScrollExpand,
  BRACKET_EXPORT_SCROLL_ATTR,
  buildLeagueBracketScheduleQuery,
  findBracketExportScrollRoot,
} from './leagueBracketShare.util';

describe('buildLeagueBracketScheduleQuery', () => {
  it('includes roundId and group for schedule bracket deep link', () => {
    const q = buildLeagueBracketScheduleQuery({ roundId: 'r1', groupId: 'g1' });
    const sp = new URLSearchParams(q);
    expect(sp.get('tab')).toBe('schedule');
    expect(sp.get('subtab')).toBe('bracket');
    expect(sp.get('roundId')).toBe('r1');
    expect(sp.get('group')).toBe('g1');
  });
});

describe('bracket PNG export scroll expand (UX-A14)', () => {
  it('uses data attribute selector for scroll root', () => {
    expect(BRACKET_EXPORT_SCROLL_ATTR).toBe('data-bracket-export-scroll');
  });

  it('applyBracketExportScrollExpand sets full scroll width and restores', () => {
    const style = {
      overflow: 'auto',
      overflowX: 'auto',
      width: '320px',
      maxWidth: '100%',
      flexWrap: 'wrap',
    };
    const scroll = { style, scrollWidth: 1800 } as HTMLElement;
    const restore = applyBracketExportScrollExpand(scroll);
    expect(style.width).toBe('1800px');
    expect(style.overflow).toBe('visible');
    restore();
    expect(style.width).toBe('320px');
    expect(style.overflow).toBe('auto');
  });

  it('findBracketExportScrollRoot queries export scroll marker', () => {
    const scroll = { scrollWidth: 900 } as HTMLElement;
    const root = {
      querySelector: (sel: string) =>
        sel === `[${BRACKET_EXPORT_SCROLL_ATTR}]` ? scroll : null,
    } as HTMLElement;
    expect(findBracketExportScrollRoot(root)).toBe(scroll);
  });
});
