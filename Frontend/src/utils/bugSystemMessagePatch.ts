import type { ThreadIndexBugPatch } from '@/services/chat/chatThreadIndex';
import { parseSystemMessage, SystemMessageType } from './systemMessages';

/** Bug fields carried by a BUG_* system message (variables are lower-cased / signed strings on the wire). */
export function bugPatchFromSystemMessage(content: unknown): ThreadIndexBugPatch | null {
  if (typeof content !== 'string' || !content.includes('"BUG_')) return null;
  const parsed = parseSystemMessage(content);
  if (!parsed) return null;
  const v = parsed.variables;
  switch (parsed.type) {
    case SystemMessageType.BUG_STATUS_CHANGED:
      return v.status ? { status: v.status.toUpperCase() } : null;
    case SystemMessageType.BUG_TYPE_CHANGED:
      return v.type ? { bugType: v.type.toUpperCase() } : null;
    case SystemMessageType.BUG_PRIORITY_CHANGED:
    case SystemMessageType.BUG_RATING_CHANGED: {
      const raw = parsed.type === SystemMessageType.BUG_PRIORITY_CHANGED ? v.priority : v.rating;
      const n = parseInt(String(raw ?? '').replace(/^\+/, ''), 10);
      return Number.isNaN(n) ? null : { priority: n };
    }
    default:
      return null;
  }
}
