import type { ChatMessage } from '@/api/chat';

function conversationSeq(m: ChatMessage): number | null {
  const ss = m.serverSyncSeq;
  if (ss != null && Number.isFinite(Number(ss))) return Number(ss);
  const q = m.syncSeq;
  if (q != null && Number.isFinite(Number(q))) return Number(q);
  return null;
}

function encodeSeqLex(sa: number): string {
  const s = String(Math.trunc(sa));
  return `${String(s.length).padStart(3, '0')}${s}`;
}

export function computeMessageSortKey(m: ChatMessage): string {
  const t = new Date(m.createdAt).getTime();
  const timeStr = String(Number.isFinite(t) ? t : 0).padStart(15, '0');
  const sa = conversationSeq(m);
  const seqStr = sa != null ? `0${encodeSeqLex(sa)}` : `1`;
  const idPart = typeof m.id === 'string' ? m.id.normalize('NFC') : String(m.id);
  return `${timeStr}|${seqStr}|${idPart}`;
}

export function compareChatMessagesAscending(a: ChatMessage, b: ChatMessage): number {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (ta !== tb) return ta - tb;
  const sa = conversationSeq(a);
  const sb = conversationSeq(b);
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  if (sa != null && sb == null) return -1;
  if (sb != null && sa == null) return 1;
  return a.id.localeCompare(b.id);
}
