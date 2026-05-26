import { describe, expect, it, vi } from 'vitest';
import {
  applyBracketExportCapture,
  BRACKET_EXPORT_CAPTURE_ATTR,
  BRACKET_EXPORT_COLUMN_ATTR,
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

describe('bracket PNG export capture layout', () => {
  it('uses data attribute selector for scroll root', () => {
    expect(BRACKET_EXPORT_SCROLL_ATTR).toBe('data-bracket-export-scroll');
  });

  it('findBracketExportScrollRoot queries export scroll marker', () => {
    const scroll = { scrollWidth: 900 } as HTMLElement;
    const root = {
      querySelector: (sel: string) =>
        sel === `[${BRACKET_EXPORT_SCROLL_ATTR}]` ? scroll : null,
    } as HTMLElement;
    expect(findBracketExportScrollRoot(root)).toBe(scroll);
  });

  it('applyBracketExportCapture sets capture attr and content-sized flex', () => {
    const scroll = {
      style: {
        flex: '1',
        flexGrow: '1',
        height: '600px',
        minHeight: '0',
        width: '',
        maxWidth: '',
        alignItems: '',
        overflow: 'auto',
        overflowX: 'auto',
        flexWrap: '',
        flexShrink: '',
        maxHeight: '',
      },
      scrollWidth: 1200,
      offsetHeight: 0,
    } as HTMLElement;
    const col = {
      style: { width: '', minWidth: '', maxWidth: '', flexShrink: '', alignSelf: '', height: '' },
      querySelector: () => null,
    } as HTMLElement;
    const root = {
      style: { flex: '1', height: '600px', minHeight: '0', width: '', minWidth: '', overflow: '' },
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      offsetHeight: 0,
      querySelector: (sel: string) =>
        sel === `[${BRACKET_EXPORT_SCROLL_ATTR}]` ? scroll : null,
      querySelectorAll: (sel: string) =>
        sel === `[${BRACKET_EXPORT_COLUMN_ATTR}]` ? [col] : [],
    } as unknown as HTMLElement;

    const restore = applyBracketExportCapture(root);
    expect(root.setAttribute).toHaveBeenCalledWith(BRACKET_EXPORT_CAPTURE_ATTR, '');
    expect(scroll.style.flex).toBe('none');
    expect(scroll.style.height).toBe('auto');
    expect(scroll.style.alignItems).toBe('flex-start');
    expect(scroll.style.width).toBe('1200px');
    expect(col.style.width).toBe('17rem');
    restore();
    expect(root.removeAttribute).toHaveBeenCalledWith(BRACKET_EXPORT_CAPTURE_ATTR);
  });
});
