// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  applyBracketExportCapture,
  BRACKET_EXPORT_CAPTURE_ATTR,
  BRACKET_EXPORT_COLUMN_ATTR,
  BRACKET_EXPORT_SCROLL_ATTR,
  buildLeagueBracketScheduleQuery,
  exportBracketContainerPng,
  findBracketExportScrollRoot,
  prepareClonedBracketGameCards,
} from './leagueBracketShare.util';

const html2canvasMock = vi.hoisted(() => vi.fn());

vi.mock('html2canvas-pro', () => ({
  default: (...args: unknown[]) => html2canvasMock(...args),
}));

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
  it('keeps team rows containing avatar buttons while hiding action controls', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="bracket-tree-game-wrap">
        <div>
          <div class="team-row"><button>Player avatar</button><span>Team A vs Team B</span></div>
          <div class="bracket-export-hide"><button>Open game</button></div>
        </div>
      </div>
    `;

    prepareClonedBracketGameCards(root);

    expect((root.querySelector('.team-row') as HTMLElement).style.display).not.toBe('none');
    expect((root.querySelector('.bracket-export-hide') as HTMLElement).style.display).toBe('none');
  });

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
      scrollWidth: 342,
      offsetWidth: 320,
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
    expect(col.style.width).toBe('342px');
    expect(col.style.minWidth).toBe('342px');
    expect(col.style.maxWidth).toBe('342px');
    restore();
    expect(root.removeAttribute).toHaveBeenCalledWith(BRACKET_EXPORT_CAPTURE_ATTR);
  });

  it('exports through the modern-color-compatible renderer', async () => {
    const root = document.createElement('div');
    const scroll = document.createElement('div');
    scroll.setAttribute(BRACKET_EXPORT_SCROLL_ATTR, '');
    Object.defineProperty(scroll, 'scrollWidth', { value: 720 });
    root.appendChild(scroll);
    document.body.appendChild(root);

    html2canvasMock.mockResolvedValue({
      toBlob: (callback: (blob: Blob | null) => void) =>
        callback(new Blob(['png'], { type: 'image/png' })),
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:bracket'),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await exportBracketContainerPng(root);

    expect(html2canvasMock).toHaveBeenCalledWith(scroll, expect.any(Object));
    expect(click).toHaveBeenCalledOnce();
    expect(root.hasAttribute(BRACKET_EXPORT_CAPTURE_ATTR)).toBe(false);

    click.mockRestore();
    vi.unstubAllGlobals();
    root.remove();
  });
});
