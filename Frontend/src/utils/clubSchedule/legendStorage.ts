const LS_KEY = 'padelpulse-club-admin-legend-collapsed';

export function readLegendCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLegendCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}
