import type { ChatMessage } from '@/api/chat';
import { mediaCacheKeyForSrc, writeCachedMediaResponse } from '@/services/chat/chatMediaCache';

const pending = new Set<string>();
let idleHooked = false;

function drainSoon(): void {
  if (idleHooked) return;
  idleHooked = true;
  const run = () => {
    idleHooked = false;
    void drainBatch();
  };
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 250);
  }
}

async function drainBatch(): Promise<void> {
  const batch = [...pending].slice(0, 6);
  for (const k of batch) pending.delete(k);
  for (const key of batch) {
    try {
      const res = await fetch(key, { mode: 'cors', credentials: 'omit' });
      if (res.ok) await writeCachedMediaResponse(key, res);
    } catch {
      /* offline / CORS */
    }
  }
  if (pending.size > 0) drainSoon();
}

export function scheduleChatMediaThumbPrefetchForMessage(m: ChatMessage): void {
  const thumbs = m.thumbnailUrls;
  if (!thumbs?.length) return;
  for (const u of thumbs) {
    if (!u || u.startsWith('blob:') || u.startsWith('data:')) continue;
    const key = mediaCacheKeyForSrc(u);
    if (pending.has(key)) continue;
    pending.add(key);
  }
  drainSoon();
}
