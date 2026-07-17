import { config } from '../../config/env';
import type { LinkPreviewCopyKey } from './linkPreview.types';

export type BandejaLinkKind =
  | 'game'
  | 'gameChat'
  | 'gameLive'
  | 'userProfile'
  | 'userChat'
  | 'groupChat'
  | 'channelChat'
  | 'bug'
  | 'marketplaceItem'
  | 'app';

export type ParsedBandejaLink = {
  kind: BandejaLinkKind;
  id?: string;
  pathname: string;
  search: string;
  href: string;
};

function appHosts(): Set<string> {
  const hosts = new Set(['bandeja.me', 'www.bandeja.me', 'localhost', '127.0.0.1']);
  try {
    const front = new URL(config.frontendUrl);
    if (front.hostname) hosts.add(front.hostname.toLowerCase());
  } catch {
    /* ignore */
  }
  return hosts;
}

export function isBandejaAppHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (appHosts().has(host)) return true;
  if (host.endsWith('.bandeja.me')) return true;
  return false;
}

function takeId(segment: string | undefined): string | undefined {
  if (!segment) return undefined;
  const id = segment.split(/[?#]/)[0]?.trim();
  return id || undefined;
}

/** Parse bandeja / app deep links into a typed target. */
export function parseBandejaLink(urlString: string): ParsedBandejaLink | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!isBandejaAppHost(u.hostname)) return null;

  const pathname = u.pathname.replace(/\/+$/, '') || '/';
  const search = u.search || '';
  const href = u.toString();

  const gameChat = pathname.match(/^\/games\/([^/]+)\/chat$/);
  if (gameChat?.[1]) {
    return { kind: 'gameChat', id: takeId(gameChat[1]), pathname, search, href };
  }
  const gameLive = pathname.match(/^\/games\/([^/]+)\/live$/);
  if (gameLive?.[1]) {
    return { kind: 'gameLive', id: takeId(gameLive[1]), pathname, search, href };
  }
  const game = pathname.match(/^\/games\/([^/]+)$/);
  if (game?.[1]) {
    return { kind: 'game', id: takeId(game[1]), pathname, search, href };
  }
  const userProfile = pathname.match(/^\/user-profile\/([^/]+)$/);
  if (userProfile?.[1]) {
    return { kind: 'userProfile', id: takeId(userProfile[1]), pathname, search, href };
  }
  const legacyProfile = pathname.match(/^\/profile\/([^/]+)$/);
  if (legacyProfile?.[1] && !['sessions', 'connected-clubs'].includes(legacyProfile[1])) {
    return { kind: 'userProfile', id: takeId(legacyProfile[1]), pathname, search, href };
  }
  const userChat = pathname.match(/^\/user-chat\/([^/]+)$/);
  if (userChat?.[1]) {
    return { kind: 'userChat', id: takeId(userChat[1]), pathname, search, href };
  }
  const groupChat = pathname.match(/^\/group-chat\/([^/]+)$/);
  if (groupChat?.[1]) {
    return { kind: 'groupChat', id: takeId(groupChat[1]), pathname, search, href };
  }
  const channelChat = pathname.match(/^\/channel-chat\/([^/]+)$/);
  if (channelChat?.[1]) {
    return { kind: 'channelChat', id: takeId(channelChat[1]), pathname, search, href };
  }
  const bug = pathname.match(/^\/bugs\/([^/]+)$/);
  if (bug?.[1]) {
    return { kind: 'bug', id: takeId(bug[1]), pathname, search, href };
  }
  const market = pathname.match(/^\/marketplace\/([^/]+)$/);
  if (market?.[1] && !['create', 'my'].includes(market[1])) {
    return { kind: 'marketplaceItem', id: takeId(market[1]), pathname, search, href };
  }

  return { kind: 'app', pathname, search, href };
}

export function appLinkCopyKey(pathname: string, search: string): LinkPreviewCopyKey {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (pathname === '/' && q.get('focus') === 'invites') return 'app.invites';
  if (pathname === '/' || pathname === '') return 'app.home';
  if (pathname === '/find') {
    const day = q.get('dayOffset');
    if (day === '0') return 'app.findToday';
    if (day === '1') return 'app.findTomorrow';
    return 'app.find';
  }
  if (pathname === '/chats') return 'app.chats';
  if (pathname === '/chats/marketplace') return 'app.chatsMarketplace';
  if (pathname === '/create-game') return 'app.createGame';
  if (pathname === '/create-league') return 'app.createLeague';
  if (pathname === '/next-game') {
    const open = q.get('open');
    if (open === 'chat') return 'app.nextGameChat';
    if (open === 'live') return 'app.nextGameLive';
    return 'app.nextGame';
  }
  if (pathname === '/marketplace') return 'app.marketplace';
  if (pathname === '/marketplace/my') return 'app.marketplaceMy';
  if (pathname === '/leaderboard') return 'app.leaderboard';
  if (pathname === '/login') return 'app.login';
  if (pathname === '/register') return 'app.register';
  if (pathname === '/bugs') return 'app.bugs';
  if (pathname === '/profile') return 'app.profile';
  return 'app.open';
}
