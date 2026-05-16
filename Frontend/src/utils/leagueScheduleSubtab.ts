export type LeagueScheduleSubtab = 'my' | 'list' | 'table';

function parseScheduleSubtabParam(raw: string | null | undefined): LeagueScheduleSubtab | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'my' || v === 'list' || v === 'table') return v;
  return null;
}

/** Empty/missing `subtab` → My, then coerce if that segment is unavailable. */
export function resolveLeagueScheduleMode(
  subtabParam: string | null | undefined,
  showMyTab: boolean,
  canShowTableTab: boolean
): LeagueScheduleSubtab {
  const parsed = parseScheduleSubtabParam(subtabParam);
  let mode: LeagueScheduleSubtab = parsed ?? 'my';
  if (mode === 'my' && !showMyTab) mode = 'list';
  if (mode === 'table' && !canShowTableTab) mode = 'list';
  return mode;
}

/** Build `search` for `tab=schedule` with canonical `subtab` (omit when My + My tab visible). */
export function canonicalScheduleQuery(
  currentSearch: string,
  mode: LeagueScheduleSubtab,
  showMyTab: boolean
): string {
  const sp = new URLSearchParams(currentSearch);
  sp.set('tab', 'schedule');
  if (mode === 'my' && showMyTab) {
    sp.delete('subtab');
  } else {
    sp.set('subtab', mode);
  }
  return sp.toString();
}

/**
 * Only rewrite the URL when `subtab` is invalid for current flags.
 * Missing/empty `subtab` is valid (means My / default).
 * Do not run while schedule data is loading — after a layout remount, `canShowTableTab` is
 * briefly false and would incorrectly strip `subtab=table`.
 */
export function repairLeagueScheduleSearchIfInvalid(
  search: string,
  showMyTab: boolean,
  canShowTableTab: boolean
): string | null {
  const sp = new URLSearchParams(search);
  if (sp.get('tab') !== 'schedule') return null;
  const raw = (sp.get('subtab') ?? '').trim().toLowerCase();
  if (!raw) return null;

  if (raw === 'my' && !showMyTab) {
    return canonicalScheduleQuery(search, 'list', false);
  }
  if (raw === 'table' && !canShowTableTab) {
    return canonicalScheduleQuery(search, showMyTab ? 'my' : 'list', showMyTab);
  }
  if (raw !== 'my' && raw !== 'list' && raw !== 'table') {
    return canonicalScheduleQuery(search, showMyTab ? 'my' : 'list', showMyTab);
  }
  return null;
}
