const CHUNK_RELOAD_KEY = 'bandeja_chunk_reload_ts';

const CHUNK_LOAD_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\d]+ failed/i;

export function isChunkLoadError(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason ?? '');
  return CHUNK_LOAD_ERROR.test(msg);
}

async function clearSwAndCaches(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  }
  if ('caches' in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  }
}

export async function recoverFromChunkLoadError(opts?: { force?: boolean }): Promise<boolean> {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
  if (!opts?.force && Date.now() - last < 15_000) return false;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  await clearSwAndCaches();
  window.location.reload();
  return true;
}

export function installChunkLoadRecovery(): void {
  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) return;
    event.preventDefault();
    void recoverFromChunkLoadError();
  });
}
