import type { AgentChatDto } from '@shared/agentContract';

export type AgentChatGroupKind = 'pinned' | 'today' | 'yesterday' | 'previous7Days' | 'previous30Days' | 'month';

export interface AgentChatGroup {
  /** Stable React key: the kind, or `month-YYYY-MM`. */
  key: string;
  kind: AgentChatGroupKind;
  /** First day of the month (local time) for `month` groups. */
  month?: Date;
  chats: AgentChatDto[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar days back from `now` in local time (DST-safe: compares local midnights). */
function daysAgo(updatedAt: Date, now: Date): number {
  return Math.round((startOfLocalDay(now) - startOfLocalDay(updatedAt)) / DAY_MS);
}

/**
 * Chat list sections in list order: Pinned (main view only), Today, Yesterday, Previous 7 days,
 * Previous 30 days, then one section per older month. Rows keep their incoming order inside a
 * section (the server's: pinned first, then by last activity); empty sections are dropped.
 */
export function groupAgentChats(
  chats: readonly AgentChatDto[],
  now: Date = new Date(),
  opts: { pinned?: boolean } = {},
): AgentChatGroup[] {
  const groups: AgentChatGroup[] = [];
  const byKey = new Map<string, AgentChatGroup>();
  const push = (key: string, kind: AgentChatGroupKind, chat: AgentChatDto, month?: Date) => {
    let group = byKey.get(key);
    if (!group) {
      group = month ? { key, kind, month, chats: [] } : { key, kind, chats: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.chats.push(chat);
  };

  for (const chat of chats) {
    if (opts.pinned && chat.pinnedAt) {
      push('pinned', 'pinned', chat);
      continue;
    }
    const updated = new Date(chat.updatedAt);
    const days = Number.isNaN(updated.getTime()) ? 0 : daysAgo(updated, now);
    if (days <= 0) push('today', 'today', chat);
    else if (days === 1) push('yesterday', 'yesterday', chat);
    else if (days <= 7) push('previous7Days', 'previous7Days', chat);
    else if (days <= 30) push('previous30Days', 'previous30Days', chat);
    else {
      const month = new Date(updated.getFullYear(), updated.getMonth(), 1);
      const key = `month-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      push(key, 'month', chat, month);
    }
  }

  // Pinned on top, then the date buckets newest → oldest (input order already is, but a stale
  // row or clock skew must not shuffle the section order).
  const rank = (g: AgentChatGroup) =>
    g.kind === 'pinned'
      ? -Infinity
      : g.kind === 'month'
        ? -(g.month as Date).getTime()
        : { today: -4e15, yesterday: -3e15, previous7Days: -2e15, previous30Days: -1e15 }[g.kind];
  return groups.sort((a, b) => rank(a) - rank(b));
}

/** "March" for this year's months, "March 2025" for older ones; localized via Intl. */
export function agentChatMonthLabel(month: Date, locale: string, now: Date = new Date()): string {
  const opts: Intl.DateTimeFormatOptions =
    month.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' };
  let label: string;
  try {
    label = new Intl.DateTimeFormat(locale, opts).format(month);
  } catch {
    label = new Intl.DateTimeFormat(undefined, opts).format(month);
  }
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

/** Lower-case, accents stripped (NFD), whitespace collapsed: "Équipe  Pádel" → "equipe padel". */
export function normalizeAgentSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chats whose title or last-message preview contains every word of the query (any order). */
export function filterAgentChats<T extends Pick<AgentChatDto, 'title' | 'lastMessagePreview'>>(
  chats: readonly T[],
  query: string,
  previewOf: (chat: T) => string = (chat) => chat.lastMessagePreview ?? '',
): T[] {
  const words = normalizeAgentSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...chats];
  return chats.filter((chat) => {
    const haystack = normalizeAgentSearch(`${chat.title ?? ''} ${previewOf(chat)}`);
    return words.every((w) => haystack.includes(w));
  });
}
