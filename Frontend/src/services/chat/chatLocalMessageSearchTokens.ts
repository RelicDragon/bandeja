import type { Transaction } from 'dexie';

const MAX_TOKENS = 40;
const MIN_LEN = 2;

export function tokenizeForSearchIndex(searchText: string | null | undefined): string[] {
  if (!searchText?.trim()) return [];
  const parts = searchText.split(/[^a-z0-9]+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (p.length < MIN_LEN) continue;
    const t = p.length > 64 ? p.slice(0, 64) : p;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

export async function replaceMessageSearchTokensInTransaction(
  tx: Transaction,
  messageId: string,
  searchText: string | null | undefined
): Promise<void> {
  const tbl = tx.table('messageSearchTokens');
  await tbl.where('messageId').equals(messageId).delete();
  for (const token of tokenizeForSearchIndex(searchText)) {
    await tbl.put({ id: `${messageId}\u0001${token}`, messageId, token });
  }
}
