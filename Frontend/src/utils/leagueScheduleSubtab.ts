import type { RoundTypeFilterValue } from '@/utils/roundTypeFilterStorage';

export type LeagueScheduleView = 'my' | 'list' | 'table' | 'bracket';
/** URL `subtab` values. `regular` / `playoff` are season markers; the rest are views. */
export type LeagueScheduleSubtab = LeagueScheduleView | 'regular' | 'playoff';

function parseScheduleSubtabParam(raw: string | null | undefined): LeagueScheduleSubtab | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (
    v === 'my' ||
    v === 'list' ||
    v === 'table' ||
    v === 'bracket' ||
    v === 'regular' ||
    v === 'playoff'
  ) {
    return v;
  }
  return null;
}

export function roundTypeFromScheduleSubtab(
  subtabParam: string | null | undefined
): RoundTypeFilterValue | null {
  const parsed = parseScheduleSubtabParam(subtabParam);
  if (parsed === 'bracket' || parsed === 'playoff') return 'PLAYOFF';
  if (parsed === 'regular' || parsed === 'table') return 'REGULAR';
  return null;
}

export function resolveLeagueScheduleMode(
  subtabParam: string | null | undefined,
  showMyTab: boolean,
  canShowTableTab: boolean,
  hasBracketPlayoff = false,
  bracketTakeover = hasBracketPlayoff
): LeagueScheduleView {
  const parsed = parseScheduleSubtabParam(subtabParam);
  const regularView: LeagueScheduleView = showMyTab ? 'my' : 'list';
  if (parsed === 'regular' || parsed === 'playoff') return regularView;
  if (!parsed) return hasBracketPlayoff ? 'bracket' : regularView;
  let mode: LeagueScheduleView = parsed;
  if (mode === 'my' && !showMyTab) mode = 'list';
  if (mode === 'table' && !canShowTableTab) mode = regularView;
  if (mode === 'bracket' && (!hasBracketPlayoff || !bracketTakeover)) mode = regularView;
  return mode;
}

export function canonicalScheduleQuery(
  currentSearch: string,
  mode: LeagueScheduleSubtab,
  showMyTab: boolean,
  hasBracketPlayoff = false
): string {
  const sp = new URLSearchParams(currentSearch);
  sp.set('tab', 'schedule');
  if (mode === 'my' && showMyTab && !hasBracketPlayoff) {
    sp.delete('subtab');
  } else {
    sp.set('subtab', mode);
  }
  return sp.toString();
}

export function inferRoundTypeFromScheduleSearch(
  search: string,
  hasPlayoffRounds: boolean
): RoundTypeFilterValue | null {
  const sp = new URLSearchParams(search);
  if (sp.get('tab') !== 'schedule') return null;
  const fromSubtab = roundTypeFromScheduleSubtab(sp.get('subtab'));
  if (fromSubtab) return fromSubtab;
  const parsed = parseScheduleSubtabParam(sp.get('subtab'));
  if (parsed) return null;
  if (hasPlayoffRounds) return 'PLAYOFF';
  return null;
}

/**
 * Only rewrite the URL when `subtab` is invalid for current flags.
 * Missing/empty `subtab` → `subtab=bracket` when a bracket playoff exists.
 * Do not run while schedule data is loading — after a layout remount, `canShowTableTab` is
 * briefly false and would incorrectly strip `subtab=table`.
 */
export function repairLeagueScheduleSearchIfInvalid(
  search: string,
  showMyTab: boolean,
  canShowTableTab: boolean,
  hasBracketPlayoff = false,
  bracketTakeover = hasBracketPlayoff
): string | null {
  const sp = new URLSearchParams(search);
  if (sp.get('tab') !== 'schedule') return null;
  const raw = (sp.get('subtab') ?? '').trim().toLowerCase();
  if (!raw) {
    if (hasBracketPlayoff) {
      return canonicalScheduleQuery(search, 'bracket', showMyTab, hasBracketPlayoff);
    }
    return null;
  }

  if (raw === 'regular' || raw === 'playoff') return null;

  if (raw === 'my' && !showMyTab) {
    return canonicalScheduleQuery(search, 'list', false, hasBracketPlayoff);
  }
  if (raw === 'table' && !canShowTableTab) {
    return canonicalScheduleQuery(
      search,
      hasBracketPlayoff && !bracketTakeover ? 'regular' : showMyTab ? 'my' : 'list',
      showMyTab,
      hasBracketPlayoff
    );
  }
  if (raw === 'bracket' && !bracketTakeover) {
    return canonicalScheduleQuery(search, 'regular', showMyTab, hasBracketPlayoff);
  }
  if (
    raw !== 'my' &&
    raw !== 'list' &&
    raw !== 'table' &&
    raw !== 'bracket' &&
    raw !== 'regular' &&
    raw !== 'playoff'
  ) {
    return canonicalScheduleQuery(
      search,
      hasBracketPlayoff && bracketTakeover
        ? 'bracket'
        : hasBracketPlayoff
          ? 'regular'
          : showMyTab
            ? 'my'
            : 'list',
      showMyTab,
      hasBracketPlayoff
    );
  }
  return null;
}

export function scheduleSubtabForSeasonSwitch(
  season: RoundTypeFilterValue,
  hasBracketPlayoff: boolean
): LeagueScheduleSubtab {
  if (season === 'REGULAR') return 'regular';
  return hasBracketPlayoff ? 'bracket' : 'playoff';
}

export function scheduleSubtabForViewSwitch(
  view: LeagueScheduleView,
  season: RoundTypeFilterValue,
  hasBracketPlayoff: boolean
): LeagueScheduleSubtab {
  if (view === 'bracket') return 'bracket';
  if (view === 'my' && season === 'PLAYOFF') return 'playoff';
  if (view === 'my' && hasBracketPlayoff) return 'my';
  return view;
}
