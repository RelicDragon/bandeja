/**
 * Deep-link catalog — TypeScript source of truth.
 * Committed mirror: `catalog.mirror.json` (sync via `npm run sync:deep-link-catalog`).
 * Native adapters stay hand-maintained; CI parity fails on drift (#274 / #278).
 * Assistant feature vs gameEntity layers: `assistantRegistry.ts` (#279).
 */

export const BANDEJA_HTTPS_ORIGIN = 'https://bandeja.me' as const;

/** Locked findToday path — literal SoT (query order fixed; do not rearrange). */
export const FIND_TODAY_PATH = '/find?view=calendar&dayOffset=0' as const;

/** Locked findTomorrow path — same query order as findToday. */
export const FIND_TOMORROW_PATH = '/find?view=calendar&dayOffset=1' as const;

export type FindView = 'calendar' | 'list';

export type FindDeepLinkParams = {
  view?: FindView;
  /** 0 = today, 1 = tomorrow, … */
  dayOffset?: number;
  /** Explicit calendar day `YYYY-MM-DD` (wins over dayOffset). */
  date?: string;
};

/** Build `/find` path + query (no origin). Stable insertion order: view → date|dayOffset. */
export function buildFindPath(params: FindDeepLinkParams = {}): string {
  const search = new URLSearchParams();
  search.set('view', params.view ?? 'calendar');
  if (params.date != null && params.date !== '') {
    search.set('date', params.date);
  } else if (params.dayOffset != null) {
    search.set('dayOffset', String(params.dayOffset));
  }
  const q = search.toString();
  return q ? `/find?${q}` : '/find';
}

export function absoluteBandejaUrl(pathWithQuery: string): string {
  const path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  return `${BANDEJA_HTTPS_ORIGIN}${path}`;
}

/**
 * Named assistant / shortcut / widget actions (static HTTPS targets).
 * Keep literals stable — native copies + mirror must match exactly.
 */
export const DEEP_LINK_ACTIONS = {
  myGames: { id: 'myGames', path: '/' },
  login: { id: 'login', path: '/login' },
  findToday: { id: 'findToday', path: FIND_TODAY_PATH },
  findTomorrow: { id: 'findTomorrow', path: FIND_TOMORROW_PATH },
  createGame: { id: 'createGame', path: '/create-game' },
  createLeague: { id: 'createLeague', path: '/create-league' },
  nextGame: { id: 'nextGame', path: '/next-game' },
  nextGameChat: { id: 'nextGameChat', path: '/next-game?open=chat' },
  nextGameLive: { id: 'nextGameLive', path: '/next-game?open=live' },
  chats: { id: 'chats', path: '/chats' },
  invites: { id: 'invites', path: '/?focus=invites' },
} as const satisfies Record<string, { id: string; path: string }>;

export type DeepLinkActionId = keyof typeof DEEP_LINK_ACTIONS;

/** Path templates for game-scoped deep links (`{id}` placeholder). */
export const DEEP_LINK_TEMPLATES = {
  game: { id: 'game', pathTemplate: '/games/{id}' },
  gameChat: { id: 'gameChat', pathTemplate: '/games/{id}/chat' },
  gameLive: { id: 'gameLive', pathTemplate: '/games/{id}/live' },
} as const satisfies Record<string, { id: string; pathTemplate: string }>;

export type DeepLinkTemplateId = keyof typeof DEEP_LINK_TEMPLATES;

export function deepLinkActionPath(id: DeepLinkActionId): string {
  return DEEP_LINK_ACTIONS[id].path;
}

export function deepLinkActionUrl(id: DeepLinkActionId): string {
  return absoluteBandejaUrl(DEEP_LINK_ACTIONS[id].path);
}

export function deepLinkTemplatePath(
  id: DeepLinkTemplateId,
  gameId: string,
): string {
  return DEEP_LINK_TEMPLATES[id].pathTemplate.replace(/\{id\}/g, gameId);
}

export function deepLinkTemplateUrl(
  id: DeepLinkTemplateId,
  gameId: string,
): string {
  return absoluteBandejaUrl(deepLinkTemplatePath(id, gameId));
}

export function buildGamePath(gameId: string): string {
  return deepLinkTemplatePath('game', gameId);
}

export function buildGameChatPath(gameId: string): string {
  return deepLinkTemplatePath('gameChat', gameId);
}

export function buildGameLivePath(gameId: string): string {
  return deepLinkTemplatePath('gameLive', gameId);
}

/**
 * Order-independent: `/find` with exactly view=calendar & dayOffset=0
 * (and no other query keys) is the findToday action.
 */
export function isFindTodayPath(pathWithSearch: string): boolean {
  let url: URL;
  try {
    url = new URL(pathWithSearch, BANDEJA_HTTPS_ORIGIN);
  } catch {
    return false;
  }
  if (url.pathname.replace(/\/+$/, '') !== '/find') return false;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 2) return false;
  if (!keys.includes('view') || !keys.includes('dayOffset')) return false;
  return (
    url.searchParams.get('view') === 'calendar' &&
    url.searchParams.get('dayOffset') === '0'
  );
}

/** Cap route target: canonicalize findToday; otherwise forward path + search as-is. */
export function resolveFindDeepLinkTarget(pathname: string, search: string): string {
  const pathWithSearch = search ? `${pathname}${search}` : pathname;
  if (isFindTodayPath(pathWithSearch)) {
    return FIND_TODAY_PATH;
  }
  return pathWithSearch;
}

/** Android static shortcutId → catalog action id (App Actions + launcher). */
export const ANDROID_SHORTCUT_ACTION_IDS = {
  find_games: 'findToday',
  next_game: 'nextGame',
  my_games: 'myGames',
  chats: 'chats',
  invites: 'invites',
  find_tomorrow: 'findTomorrow',
  create_game: 'createGame',
  create_league: 'createLeague',
  game_chat: 'nextGameChat',
  live_scoring: 'nextGameLive',
} as const satisfies Record<string, DeepLinkActionId>;

export type AndroidShortcutId = keyof typeof ANDROID_SHORTCUT_ACTION_IDS;

export type DeepLinkCatalogMirrorAction = {
  path: string;
  url: string;
};

export type DeepLinkCatalogMirrorTemplate = {
  pathTemplate: string;
  urlTemplate: string;
};

export type DeepLinkCatalogMirror = {
  origin: typeof BANDEJA_HTTPS_ORIGIN;
  actions: Record<DeepLinkActionId, DeepLinkCatalogMirrorAction>;
  templates: Record<DeepLinkTemplateId, DeepLinkCatalogMirrorTemplate>;
};

export function serializeDeepLinkCatalogMirror(): DeepLinkCatalogMirror {
  const actions = {} as DeepLinkCatalogMirror['actions'];
  for (const id of Object.keys(DEEP_LINK_ACTIONS) as DeepLinkActionId[]) {
    const path = DEEP_LINK_ACTIONS[id].path;
    actions[id] = { path, url: absoluteBandejaUrl(path) };
  }
  const templates = {} as DeepLinkCatalogMirror['templates'];
  for (const id of Object.keys(DEEP_LINK_TEMPLATES) as DeepLinkTemplateId[]) {
    const pathTemplate = DEEP_LINK_TEMPLATES[id].pathTemplate;
    templates[id] = {
      pathTemplate,
      urlTemplate: absoluteBandejaUrl(pathTemplate),
    };
  }
  return { origin: BANDEJA_HTTPS_ORIGIN, actions, templates };
}
