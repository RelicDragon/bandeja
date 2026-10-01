/**
 * Pin TCP connects to the addresses `resolveHostSafety` approved (port of travel-bandeja
 * `webFetch/pinnedDispatcher.js`, docs/plans/ai-agent-web-search.md §13.7.2).
 *
 * `fetch` would resolve DNS again after the check; an attacker-controlled name can answer
 * a public IP first and a private one second (rebinding TOCTOU). The undici connect lookup
 * below ignores the hostname and returns only the vetted records, while TLS SNI and the
 * Host header keep the original name.
 */
import type { LookupAddress, LookupOptions } from 'node:dns';
import { Agent } from 'undici';
import type { PinnedAddress } from './ssrfGuard';

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

export function normalizePinnedAddresses(list: readonly (PinnedAddress | string)[] | null | undefined): PinnedAddress[] {
  if (!Array.isArray(list)) return [];
  const out: PinnedAddress[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const address = String(typeof entry === 'string' ? entry : entry?.address ?? '')
      .replace(/^\[|\]$/g, '')
      .trim();
    if (!address) continue;
    const explicit = typeof entry === 'object' && entry ? Number(entry.family) : NaN;
    const family: 4 | 6 = explicit === 4 || explicit === 6 ? explicit : address.includes(':') ? 6 : 4;
    const key = `${family}:${address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ address, family });
  }
  return out;
}

/** `dns.lookup`-compatible function returning only the pinned records. */
export function makePinnedLookup(addresses: readonly PinnedAddress[]) {
  const pinned = normalizePinnedAddresses(addresses);
  return function pinnedLookup(
    _hostname: string,
    optionsOrCallback: LookupOptions | LookupCallback,
    maybeCallback?: LookupCallback,
  ): void {
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as LookupCallback;
    const options: LookupOptions = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback ?? {};
    if (!pinned.length) {
      const err: NodeJS.ErrnoException = new Error('No pinned addresses');
      err.code = 'ENOTFOUND';
      callback(err, '');
      return;
    }
    const wanted = options.family === 4 || options.family === 6 ? options.family : null;
    const filtered = wanted ? pinned.filter((r) => r.family === wanted) : pinned;
    const records = filtered.length ? filtered : pinned;
    if (options.all) {
      callback(null, records.map((r) => ({ address: r.address, family: r.family })));
      return;
    }
    callback(null, records[0].address, records[0].family);
  };
}

export function createPinnedDispatcher(addresses: readonly PinnedAddress[]): Agent {
  const pinned = normalizePinnedAddresses(addresses);
  if (!pinned.length) throw new Error('createPinnedDispatcher requires at least one address');
  return new Agent({ connect: { lookup: makePinnedLookup(pinned) } });
}

export async function closeDispatcher(dispatcher: Agent | null | undefined): Promise<void> {
  if (!dispatcher) return;
  try {
    await dispatcher.close();
  } catch {
    /* already closed */
  }
}
