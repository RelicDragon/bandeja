import html2canvas from 'html2canvas';

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

/** Expand horizontal scroll so html2canvas captures all columns (UX-A14). */
export function findBracketExportScrollRoot(element: HTMLElement): HTMLElement | null {
  return element.querySelector<HTMLElement>(`[${BRACKET_EXPORT_SCROLL_ATTR}]`);
}

export function applyBracketExportScrollExpand(scrollRoot: HTMLElement): () => void {
  const saved = {
    overflow: scrollRoot.style.overflow,
    overflowX: scrollRoot.style.overflowX,
    width: scrollRoot.style.width,
    maxWidth: scrollRoot.style.maxWidth,
    flexWrap: scrollRoot.style.flexWrap,
  };
  const fullWidth = scrollRoot.scrollWidth;
  scrollRoot.style.overflow = 'visible';
  scrollRoot.style.overflowX = 'visible';
  scrollRoot.style.flexWrap = 'nowrap';
  scrollRoot.style.width = `${fullWidth}px`;
  scrollRoot.style.maxWidth = 'none';
  return () => {
    scrollRoot.style.overflow = saved.overflow;
    scrollRoot.style.overflowX = saved.overflowX;
    scrollRoot.style.width = saved.width;
    scrollRoot.style.maxWidth = saved.maxWidth;
    scrollRoot.style.flexWrap = saved.flexWrap;
  };
}

export async function exportBracketContainerPng(
  element: HTMLElement,
  filename = 'bracket.png'
): Promise<void> {
  const scrollRoot = findBracketExportScrollRoot(element);
  const restore = scrollRoot ? applyBracketExportScrollExpand(scrollRoot) : null;
  try {
    const width = scrollRoot ? scrollRoot.scrollWidth : element.scrollWidth;
    const height = scrollRoot ? scrollRoot.scrollHeight : element.scrollHeight;
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
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
    restore?.();
  }
}
