import { isAppLinkPreviewHost } from '@/components/MessageItem/linkPreview/eligibility';

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
/** cuid-style ids; shorter matches are previews cut mid-link. */
const GAME_PATH_RE = /^\/games\/([A-Za-z0-9_-]{20,})(?:\/(?:chat|live))?\/?$/;

export type ChatListGameLink = { url: string; gameId: string };

/** The first in-app game link in a chat-list preview line, if any. */
export function findChatListGameLink(text: string | null | undefined): ChatListGameLink | null {
  if (!text) return null;
  for (const match of text.matchAll(URL_RE)) {
    try {
      const u = new URL(match[0]);
      if (!isAppLinkPreviewHost(u.hostname)) continue;
      const gameId = u.pathname.match(GAME_PATH_RE)?.[1];
      if (gameId) return { url: match[0], gameId };
    } catch {
      // not a URL after all
    }
  }
  return null;
}

/** The preview text with the link removed, once the strip below it shows the game. */
export function stripChatListGameLink(text: string, link: ChatListGameLink): string {
  return text.split(link.url).join('').replace(/[ \t]{2,}/g, ' ').trim();
}
