import html2canvas from 'html2canvas';
import { BRACKET_EXPORT_COLUMN_WIDTH } from '@/utils/bracketTreeCard.util';

export function buildLeagueBracketScheduleQuery(params: {
  roundId?: string;
  groupId?: string | null;
}): string {
  const sp = new URLSearchParams();
  sp.set('tab', 'schedule');
  sp.set('subtab', 'bracket');
  if (params.roundId) {
    sp.set('roundId', params.roundId);
    sp.set('round', params.roundId);
  }
  if (params.groupId) sp.set('group', params.groupId);
  return sp.toString();
}

export function buildLeagueBracketShareUrl(
  leagueSeasonId: string,
  params: { roundId?: string; groupId?: string | null }
): string {
  const query = buildLeagueBracketScheduleQuery(params);
  return `${window.location.origin}/games/${leagueSeasonId}?${query}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

export const BRACKET_EXPORT_SCROLL_ATTR = 'data-bracket-export-scroll';
export const BRACKET_EXPORT_CAPTURE_ATTR = 'data-bracket-export-capture';
export const BRACKET_EXPORT_COLUMN_ATTR = 'data-bracket-export-column';
export const BRACKET_EXPORT_SLOTS_ATTR = 'data-bracket-export-slots';

function saveInlineStyles(el: HTMLElement, patch: Partial<CSSStyleDeclaration>): () => void {
  const keys = Object.keys(patch) as (keyof CSSStyleDeclaration)[];
  const saved = keys.map((key) => [key, el.style[key]] as const);
  Object.assign(el.style, patch);
  return () => {
    for (const [key, value] of saved) {
      el.style[key] = value;
    }
  };
}

export function findBracketExportScrollRoot(element: HTMLElement): HTMLElement | null {
  return element.querySelector<HTMLElement>(`[${BRACKET_EXPORT_SCROLL_ATTR}]`);
}

/** Widen columns, drop flex stretch, and mark capture mode before html2canvas. */
export function applyBracketExportCapture(exportRoot: HTMLElement): () => void {
  const scrollRoot = findBracketExportScrollRoot(exportRoot);
  const restores: Array<() => void> = [];

  exportRoot.setAttribute(BRACKET_EXPORT_CAPTURE_ATTR, '');

  if (exportRoot !== scrollRoot) {
    restores.push(
      saveInlineStyles(exportRoot, {
        flex: 'none',
        flexGrow: '0',
        height: 'auto',
        minHeight: '0',
        width: 'max-content',
        minWidth: 'max-content',
        overflow: 'visible',
      })
    );
  }

  if (scrollRoot) {
    restores.push(
      saveInlineStyles(scrollRoot, {
        flex: 'none',
        flexGrow: '0',
        flexShrink: '0',
        height: 'auto',
        minHeight: '0',
        maxHeight: 'none',
        alignItems: 'flex-start',
        overflow: 'visible',
        overflowX: 'visible',
        flexWrap: 'nowrap',
        maxWidth: 'none',
      })
    );
    void scrollRoot.offsetHeight;
    const fullWidth = scrollRoot.scrollWidth;
    restores.push(saveInlineStyles(scrollRoot, { width: `${fullWidth}px` }));
  }

  const columnWidth = BRACKET_EXPORT_COLUMN_WIDTH;
  exportRoot.querySelectorAll<HTMLElement>(`[${BRACKET_EXPORT_COLUMN_ATTR}]`).forEach((col) => {
    restores.push(
      saveInlineStyles(col, {
        width: columnWidth,
        minWidth: columnWidth,
        maxWidth: columnWidth,
        flexShrink: '0',
        alignSelf: 'flex-start',
        height: 'auto',
      })
    );
    const slotsCol = col.querySelector<HTMLElement>(`[${BRACKET_EXPORT_SLOTS_ATTR}]`);
    if (slotsCol) {
      restores.push(
        saveInlineStyles(slotsCol, {
          flex: 'none',
          height: 'auto',
          justifyContent: 'flex-start',
        })
      );
    }
  });

  void exportRoot.offsetHeight;

  return () => {
    exportRoot.removeAttribute(BRACKET_EXPORT_CAPTURE_ATTR);
    for (let i = restores.length - 1; i >= 0; i -= 1) {
      restores[i]();
    }
  };
}

/** Hide chrome on cloned game cards only — live LeagueGameCard stays unchanged. */
function prepareClonedBracketGameCards(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.bracket-tree-game-wrap > div').forEach((card) => {
    card.style.overflow = 'visible';
    card.querySelectorAll<HTMLElement>(':scope > div').forEach((row) => {
      if (row.querySelector('button')) {
        row.style.display = 'none';
        return;
      }
      const cls = row.className;
      if (typeof cls === 'string' && cls.includes('uppercase') && cls.includes('tracking-wide')) {
        row.style.display = 'none';
      }
      if (row.querySelector('[class*="yellow-50"], [class*="yellow-900"]')) {
        row.style.display = 'none';
      }
    });
  });
}

function resolveExportBackground(element: HTMLElement): string {
  const bg = getComputedStyle(element).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
  const dark = document.documentElement.classList.contains('dark');
  return dark ? '#030712' : '#f9fafb';
}

export async function exportBracketContainerPng(
  element: HTMLElement,
  filename = 'bracket.png'
): Promise<void> {
  const restoreCapture = applyBracketExportCapture(element);
  try {
    const target = findBracketExportScrollRoot(element) ?? element;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const canvas = await html2canvas(target, {
      backgroundColor: resolveExportBackground(target),
      scale: 2,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      onclone: (_doc, cloned) => {
        const clonedScroll =
          cloned.querySelector<HTMLElement>(`[${BRACKET_EXPORT_SCROLL_ATTR}]`) ?? cloned;
        clonedScroll.style.overflow = 'visible';
        clonedScroll.style.overflowX = 'visible';
        clonedScroll.style.flex = 'none';
        clonedScroll.style.height = 'auto';
        clonedScroll.style.alignItems = 'flex-start';
        cloned.querySelectorAll<HTMLElement>(`[${BRACKET_EXPORT_COLUMN_ATTR}]`).forEach((col) => {
          col.style.alignSelf = 'flex-start';
          col.style.height = 'auto';
        });
        prepareClonedBracketGameCards(cloned);
      },
    });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) throw new Error('export failed');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    restoreCapture();
  }
}
