import type { Game } from '@/types';

export type UnreadObjectsApiPayload = {
  games: Array<{ game: Game; unreadCount: number }>;
  bugs: Array<{ bug: { id?: string; groupChannelId?: string } | null | undefined; unreadCount: number }>;
  userChats: Array<{ chat: { id: string }; unreadCount: number }>;
  groupChannels: Array<{ groupChannel: { id: string }; unreadCount: number }>;
  marketItems: Array<{ marketItem?: { id?: string } | null; groupChannelId: string; unreadCount: number }>;
};

export type UnreadObjectsWarmInner = {
  games?: Array<{ game?: { id?: string } }>;
  bugs?: Array<{ bug?: { id?: string } }>;
  userChats?: Array<{ chat?: { id?: string } }>;
  groupChannels?: Array<{ groupChannel?: { id?: string } }>;
  marketItems?: Array<{ groupChannelId?: string }>;
};

export type UnreadCategoryTotals = {
  games: number;
  bugs: number;
  channels: number;
  marketplace: number;
};

export function unreadCategoryTotalsFromPayload(data: UnreadObjectsApiPayload): UnreadCategoryTotals {
  return {
    games: data.games.reduce((s, i) => s + i.unreadCount, 0),
    bugs: data.bugs.reduce((s, i) => s + i.unreadCount, 0),
    channels: (data.groupChannels ?? []).reduce((s, i) => s + i.unreadCount, 0),
    marketplace: (data.marketItems ?? []).reduce((s, i) => s + i.unreadCount, 0),
  };
}

export function unreadPayloadToWarmInner(payload: UnreadObjectsApiPayload): UnreadObjectsWarmInner {
  return {
    games: payload.games.map((g) => ({ game: g.game?.id ? { id: g.game.id } : undefined })),
    bugs: payload.bugs.map((b) => {
      const id = b.bug && typeof b.bug === 'object' && b.bug != null && 'id' in b.bug ? (b.bug as { id?: string }).id : undefined;
      return { bug: id ? { id } : undefined };
    }),
    userChats: payload.userChats.map((u) => ({ chat: { id: u.chat.id } })),
    groupChannels: payload.groupChannels.map((gc) => ({
      groupChannel: { id: gc.groupChannel.id },
    })),
    marketItems: payload.marketItems.map((m) => ({ groupChannelId: m.groupChannelId })),
  };
}

export function unreadApiEnvelopeData(envelope: { data?: UnreadObjectsApiPayload | null } | null | undefined): UnreadObjectsApiPayload | undefined {
  return envelope?.data ?? undefined;
}

export function unreadContextKeysFromPayload(payload: UnreadObjectsApiPayload | null | undefined): Set<string> {
  const s = new Set<string>();
  if (!payload) return s;
  for (const g of payload.games ?? []) {
    if (g.unreadCount > 0 && g.game?.id) s.add(`GAME:${g.game.id}`);
  }
  for (const b of payload.bugs ?? []) {
    if (b.unreadCount > 0) {
      const id = b.bug && typeof b.bug === 'object' && b.bug != null && 'id' in b.bug ? (b.bug as { id?: string }).id : undefined;
      if (id) s.add(`BUG:${id}`);
    }
  }
  for (const u of payload.userChats ?? []) {
    if (u.unreadCount > 0 && u.chat?.id) s.add(`USER:${u.chat.id}`);
  }
  for (const gc of payload.groupChannels ?? []) {
    if (gc.unreadCount > 0 && gc.groupChannel?.id) s.add(`GROUP:${gc.groupChannel.id}`);
  }
  for (const m of payload.marketItems ?? []) {
    if (m.unreadCount > 0 && m.groupChannelId) s.add(`GROUP:${m.groupChannelId}`);
  }
  return s;
}
