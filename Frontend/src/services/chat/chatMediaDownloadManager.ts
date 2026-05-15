import {
  mediaCacheKeyForSrc,
  readCachedMediaResponse,
  writeCachedMediaResponse,
} from '@/services/chat/chatMediaCache';

type DownloadState = 'idle' | 'downloading' | 'cached' | 'error';

export type ChatMediaDownloadEntry = {
  state: DownloadState;
  progress: number;
  error?: string;
};

const CHAT_MEDIA_DOWNLOAD_IDLE: ChatMediaDownloadEntry = { state: 'idle', progress: 0 };

const entries = new Map<string, ChatMediaDownloadEntry>();
const listeners = new Map<string, Set<() => void>>();

function notify(url: string) {
  listeners.get(url)?.forEach((fn) => fn());
}

export function getChatMediaDownloadIdleState(): ChatMediaDownloadEntry {
  return CHAT_MEDIA_DOWNLOAD_IDLE;
}

export function getChatMediaDownloadState(url: string): ChatMediaDownloadEntry {
  return entries.get(url) ?? CHAT_MEDIA_DOWNLOAD_IDLE;
}

export function subscribeChatMediaDownload(url: string, fn: () => void): () => void {
  let set = listeners.get(url);
  if (!set) {
    set = new Set();
    listeners.set(url, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(url);
  };
}

export async function ensureChatMediaDownloaded(
  url: string,
  fetchImpl: () => Promise<Response> = () => fetch(url)
): Promise<void> {
  const existing = entries.get(url);
  if (existing?.state === 'cached' || existing?.state === 'downloading') return;

  const cacheKey = mediaCacheKeyForSrc(url);
  if (!url.startsWith('blob:') && !url.startsWith('data:')) {
    const hit = await readCachedMediaResponse(cacheKey);
    if (hit?.ok) {
      entries.set(url, { state: 'cached', progress: 1 });
      notify(url);
      return;
    }
  }

  entries.set(url, { state: 'downloading', progress: 0 });
  notify(url);

  try {
    const res = await fetchImpl();
    if (!res.ok) throw new Error(`http_${res.status}`);
    const reader = res.body?.getReader();
    const len = Number(res.headers.get('content-length') || 0);
    const contentType = res.headers.get('content-type') || undefined;

    if (!reader) {
      const blob = await res.blob();
      if (!url.startsWith('blob:') && !url.startsWith('data:')) {
        await writeCachedMediaResponse(
          cacheKey,
          new Response(blob, { status: 200, headers: { 'Content-Type': blob.type || contentType || '' } })
        );
      }
      entries.set(url, { state: 'cached', progress: 1 });
      notify(url);
      return;
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.length;
      }
      const progress = len > 0 ? Math.min(1, loaded / len) : 0;
      entries.set(url, { state: 'downloading', progress });
      notify(url);
    }

    const blob = new Blob(chunks, { type: contentType });
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      await writeCachedMediaResponse(
        cacheKey,
        new Response(blob, { status: 200, headers: { 'Content-Type': blob.type || contentType || '' } })
      );
    }
    entries.set(url, { state: 'cached', progress: 1 });
    notify(url);
  } catch (e) {
    entries.set(url, {
      state: 'error',
      progress: 0,
      error: e instanceof Error ? e.message : 'download_failed',
    });
    notify(url);
    throw e;
  }
}
