export type Place =
  | 'home'
  | 'find'
  | 'chats'
  | 'chatsMarketplace'
  | 'bugs'
  | 'marketplace'
  | 'marketplaceMy'
  | 'leaderboard'
  | 'profile'
  | 'gameSubscriptions'
  | 'game'
  | 'gameChat'
  | 'userChat'
  | 'groupChat'
  | 'channelChat'
  | 'createGame'
  | 'createLeague'
  | 'createMarketItem'
  | 'editMarketItem'
  | 'marketplaceItem'
  | 'selectCity'
  | 'completeProfile'
  | 'login'
  | 'loginPhone'
  | 'loginTelegram'
  | 'register'
  | 'character';

export interface PlaceParams {
  [key: string]: string | number | boolean | undefined;
}

export interface Overlay {
  type: 'player' | 'item';
  id: string;
}

export interface ParsedLocation {
  place: Place;
  params: PlaceParams;
  overlay?: Overlay;
}

export type PageType =
  | 'my'
  | 'find'
  | 'chats'
  | 'bugs'
  | 'profile'
  | 'leaderboard'
  | 'gameDetails'
  | 'gameSubscriptions'
  | 'marketplace';

interface PlaceDefinition {
  pattern: RegExp;
  place: Place;
  extractParams?: (match: RegExpMatchArray, search: URLSearchParams) => PlaceParams;
}

const PLACE_DEFS: PlaceDefinition[] = [
  { pattern: /^\/games\/([^/]+)\/chat$/, place: 'gameChat', extractParams: (m) => ({ id: m[1] }) },
  { pattern: /^\/games\/([^/]+)$/, place: 'game', extractParams: (m) => ({ id: m[1] }) },
  { pattern: /^\/marketplace\/create$/, place: 'createMarketItem' },
  { pattern: /^\/marketplace\/my$/, place: 'marketplaceMy' },
  { pattern: /^\/marketplace\/([^/]+)\/edit$/, place: 'editMarketItem', extractParams: (m) => ({ id: m[1] }) },
  { pattern: /^\/marketplace\/([^/]+)$/, place: 'marketplaceItem', extractParams: (m) => ({ id: m[1] }) },
  { pattern: /^\/marketplace\/?$/, place: 'marketplace' },
  { pattern: /^\/chats\/marketplace$/, place: 'chatsMarketplace' },
  { pattern: /^\/chats\/?$/, place: 'chats' },
  { pattern: /^\/bugs\/?$/, place: 'bugs' },
  { pattern: /^\/find\/?$/, place: 'find' },
  { pattern: /^\/profile\/?$/, place: 'profile' },
  { pattern: /^\/leaderboard\/?$/, place: 'leaderboard' },
  { pattern: /^\/game-subscriptions\/?$/, place: 'gameSubscriptions' },
  { pattern: /^\/user-chat\/([^/]+)$/, place: 'userChat', extractParams: (m) => ({ id: m[1] }) },
  { pattern: /^\/group-chat\/([^/]+)$/, place: 'groupChat', extractParams: (m) => ({ id: m[1] }) },
  { pattern: /^\/channel-chat\/([^/]+)$/, place: 'channelChat', extractParams: (m) => ({ id: m[1] }) },
  { pattern: /^\/create-game\/?$/, place: 'createGame' },
  { pattern: /^\/create-league\/?$/, place: 'createLeague' },
  { pattern: /^\/select-city\/?$/, place: 'selectCity' },
  { pattern: /^\/complete-profile\/?$/, place: 'completeProfile' },
  { pattern: /^\/login\/phone$/, place: 'loginPhone' },
  { pattern: /^\/login\/telegram$/, place: 'loginTelegram' },
  { pattern: /^\/login\/?$/, place: 'login' },
  { pattern: /^\/register\/?$/, place: 'register' },
  { pattern: /^\/character\/?$/, place: 'character' },
  { pattern: /^\/$/, place: 'home' },
];

export function parseLocation(pathname: string, search: string): ParsedLocation {
  const sp = new URLSearchParams(search);

  for (const def of PLACE_DEFS) {
    const match = pathname.match(def.pattern);
    if (match) {
      const baseParams = def.extractParams ? def.extractParams(match, sp) : {};
      const params: PlaceParams = { ...baseParams };

      for (const [key, value] of sp.entries()) {
        if (key !== 'player' && key !== 'item') {
          params[key] = value;
        }
      }

      return { place: def.place, params, overlay: getOverlay(search) ?? undefined };
    }
  }

  return { place: 'home', params: {}, overlay: getOverlay(search) ?? undefined };
}

export function buildUrl(place: Place, params?: PlaceParams, overlay?: Overlay): string {
  let path: string;

  switch (place) {
    case 'home': path = '/'; break;
    case 'find': path = '/find'; break;
    case 'chats': path = '/chats'; break;
    case 'chatsMarketplace': path = '/chats/marketplace'; break;
    case 'bugs': path = '/bugs'; break;
    case 'marketplace': path = '/marketplace'; break;
    case 'marketplaceMy': path = '/marketplace/my'; break;
    case 'leaderboard': path = '/leaderboard'; break;
    case 'profile': path = '/profile'; break;
    case 'gameSubscriptions': path = '/game-subscriptions'; break;
    case 'game': path = `/games/${params?.id ?? ''}`; break;
    case 'gameChat': path = `/games/${params?.id ?? ''}/chat`; break;
    case 'userChat': path = `/user-chat/${params?.id ?? ''}`; break;
    case 'groupChat': path = `/group-chat/${params?.id ?? ''}`; break;
    case 'channelChat': path = `/channel-chat/${params?.id ?? ''}`; break;
    case 'createGame': path = '/create-game'; break;
    case 'createLeague': path = '/create-league'; break;
    case 'createMarketItem': path = '/marketplace/create'; break;
    case 'editMarketItem': path = `/marketplace/${params?.id ?? ''}/edit`; break;
    case 'marketplaceItem': path = `/marketplace/${params?.id ?? ''}`; break;
    case 'selectCity': path = '/select-city'; break;
    case 'completeProfile': path = '/complete-profile'; break;
    case 'login': path = '/login'; break;
    case 'loginPhone': path = '/login/phone'; break;
    case 'loginTelegram': path = '/login/telegram'; break;
    case 'register': path = '/register'; break;
    case 'character': path = '/character'; break;
    default: path = '/'; break;
  }

  const qs = new URLSearchParams();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (key === 'id' || value === undefined || value === false) continue;
      qs.set(key, String(value));
    }
  }

  if (overlay) {
    qs.set(overlay.type, overlay.id);
  }

  const qsStr = qs.toString();
  return qsStr ? `${path}?${qsStr}` : path;
}

export function homeUrl(params?: PlaceParams): string {
  return buildUrl('home', params);
}

export function addOverlay(pathname: string, search: string, type: 'player' | 'item', id: string): string {
  const params = new URLSearchParams(search);
  params.set(type, id);
  return `${pathname}?${params.toString()}`;
}

export function removeOverlay(pathname: string, search: string, type: 'player' | 'item'): string {
  const params = new URLSearchParams(search);
  params.delete(type);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function getOverlay(search: string): Overlay | null {
  const params = new URLSearchParams(search);
  const player = params.get('player');
  const item = params.get('item');
  if (player) return { type: 'player', id: player };
  if (item) return { type: 'item', id: item };
  return null;
}

export function placeToPageType(place: Place): PageType {
  switch (place) {
    case 'home': return 'my';
    case 'find': return 'find';
    case 'chats':
    case 'chatsMarketplace':
    case 'bugs':
    case 'userChat':
    case 'groupChat':
    case 'channelChat':
      return 'chats';
    case 'marketplace':
    case 'marketplaceMy':
    case 'createMarketItem':
    case 'editMarketItem':
    case 'marketplaceItem':
      return 'marketplace';
    case 'leaderboard': return 'leaderboard';
    case 'profile': return 'profile';
    case 'game':
    case 'gameChat':
      return 'gameDetails';
    case 'gameSubscriptions': return 'gameSubscriptions';
    default: return 'my';
  }
}

const APP_PATH_RE =
  /^\/(find|chats|profile|leaderboard|games|create-game|create-league|rating|bugs|game-subscriptions|marketplace|user-chat|group-chat|channel-chat|select-city|complete-profile|login|register|character)(\/.*)?$/;

export function isAppPath(pathname: string): boolean {
  return pathname === '/' || APP_PATH_RE.test(pathname);
}
