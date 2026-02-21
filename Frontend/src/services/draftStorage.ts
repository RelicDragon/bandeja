import { get, set, del, keys, createStore } from 'idb-keyval';
import type { ChatContextType, ChatType } from '@/api/chat';
import type { ChatDraft } from '@/api/chat';

const draftStore = createStore('padelpulse-drafts-db', 'drafts');
const PREFIX = 'padelpulse-draft';
const SEP = '\u0001';
const DRAFT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function isExpired(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > DRAFT_EXPIRY_MS;
}

export interface LocalDraftPayload {
  content: string;
  mentionIds: string[];
  updatedAt: string;
}

function storageKey(
  userId: string,
  chatContextType: ChatContextType,
  contextId: string,
  chatType: ChatType
): string {
  return [PREFIX, userId, chatContextType, contextId, chatType].join(SEP);
}

function parseKey(key: string): { userId: string; chatContextType: ChatContextType; contextId: string; chatType: ChatType } | null {
  if (typeof key !== 'string' || !key.startsWith(PREFIX + SEP)) return null;
  const parts = key.slice(PREFIX.length + SEP.length).split(SEP);
  if (parts.length !== 4) return null;
  const [userId, chatContextType, contextId, chatType] = parts;
  return { userId, chatContextType: chatContextType as ChatContextType, contextId, chatType: chatType as ChatType };
}

function parseKeyLegacy(key: string): { userId: string; chatContextType: ChatContextType; contextId: string; chatType: ChatType } | null {
  if (typeof key !== 'string' || !key.startsWith(PREFIX + ':')) return null;
  const parts = key.slice(PREFIX.length + 1).split(':');
  if (parts.length < 4) return null;
  const [userId, chatContextType, contextId, ...chatTypeParts] = parts;
  const chatType = chatTypeParts.join(':') as ChatType;
  return { userId, chatContextType: chatContextType as ChatContextType, contextId, chatType };
}

export const draftStorage = {
  async get(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType
  ): Promise<LocalDraftPayload | null> {
    try {
      const k = storageKey(userId, chatContextType, contextId, chatType);
      let value = await get<LocalDraftPayload>(k, draftStore);
      if (value) {
        if (isExpired(value.updatedAt)) {
          await del(k, draftStore);
          return null;
        }
        return value;
      }
      const legacyKey = `${PREFIX}:${userId}:${chatContextType}:${contextId}:${chatType}`;
      value = await get<LocalDraftPayload>(legacyKey);
      if (value) {
        if (isExpired(value.updatedAt)) {
          await del(legacyKey);
          return null;
        }
        await set(k, value, draftStore);
        await del(legacyKey);
        return value;
      }
      return null;
    } catch {
      return null;
    }
  },

  async set(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    content: string,
    mentionIds: string[],
    updatedAt?: string
  ): Promise<void> {
    try {
      const k = storageKey(userId, chatContextType, contextId, chatType);
      const payload: LocalDraftPayload = {
        content,
        mentionIds: mentionIds ?? [],
        updatedAt: updatedAt ?? new Date().toISOString()
      };
      await set(k, payload, draftStore);
    } catch {
      // idb full or unavailable; server sync will still run
    }
  },

  async remove(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType: ChatType
  ): Promise<void> {
    try {
      const k = storageKey(userId, chatContextType, contextId, chatType);
      await del(k, draftStore);
      await del(`${PREFIX}:${userId}:${chatContextType}:${contextId}:${chatType}`);
    } catch {
      // continue to attempt server delete
    }
  },

  async getLocalDraftsForUser(userId: string): Promise<ChatDraft[]> {
    try {
      const result: ChatDraft[] = [];
      const seen = new Set<string>();
      const prefixNew = `${PREFIX}${SEP}${userId}${SEP}`;
      const addDraft = (parsed: ReturnType<typeof parseKey> | ReturnType<typeof parseKeyLegacy>, value: LocalDraftPayload) => {
        if (!parsed) return;
        const dedupeKey = `${parsed.chatContextType}:${parsed.contextId}:${parsed.chatType}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        result.push({
          id: `local-${parsed.chatContextType}-${parsed.contextId}-${parsed.chatType}`,
          userId: parsed.userId,
          chatContextType: parsed.chatContextType,
          contextId: parsed.contextId,
          chatType: parsed.chatType,
          content: value.content,
          mentionIds: value.mentionIds ?? [],
          updatedAt: value.updatedAt,
          createdAt: value.updatedAt
        });
      };
      const storeKeys = await keys(draftStore);
      for (const key of storeKeys) {
        if (typeof key !== 'string' || !key.startsWith(prefixNew)) continue;
        const parsed = parseKey(key);
        try {
          const value = await get<LocalDraftPayload>(key, draftStore);
          if (!value) continue;
          if (isExpired(value.updatedAt)) {
            await del(key, draftStore);
            continue;
          }
          addDraft(parsed, value);
        } catch {
          // skip
        }
      }
      const legacyPrefix = `${PREFIX}:${userId}:`;
      const defaultKeys = await keys();
      for (const key of defaultKeys) {
        if (typeof key !== 'string' || !key.startsWith(legacyPrefix)) continue;
        const parsed = parseKeyLegacy(key);
        try {
          const value = await get<LocalDraftPayload>(key);
          if (!value || isExpired(value.updatedAt)) {
            if (value) await del(key);
            continue;
          }
          addDraft(parsed, value);
          const newKey = parsed ? storageKey(parsed.userId, parsed.chatContextType, parsed.contextId, parsed.chatType) : null;
          if (newKey) {
            await set(newKey, value, draftStore);
            await del(key);
          }
        } catch {
          // skip
        }
      }
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return result;
    } catch {
      return [];
    }
  }
};

export function mergeServerAndLocalDrafts(serverDrafts: ChatDraft[] | null | undefined, localDrafts: ChatDraft[] | null | undefined): ChatDraft[] {
  const byKey = new Map<string, ChatDraft>();
  for (const d of serverDrafts ?? []) {
    const key = `${d.chatContextType}:${d.contextId}:${d.chatType}`;
    byKey.set(key, d);
  }
  for (const d of localDrafts ?? []) {
    const key = `${d.chatContextType}:${d.contextId}:${d.chatType}`;
    const existing = byKey.get(key);
    if (!existing || new Date(d.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      byKey.set(key, d);
    }
  }
  return Array.from(byKey.values());
}
