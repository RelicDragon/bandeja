import crypto from 'crypto';

export function normalizeChatClientMutationId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (s.length < 8 || s.length > 128) return null;
  if (!/^[0-9A-Za-z-]+$/.test(s)) return null;
  return s;
}

export function hashChatMutationPayload(value: unknown): string {
  const json = stableStringify(value);
  return crypto.createHash('sha256').update(json).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',')}}`;
}
