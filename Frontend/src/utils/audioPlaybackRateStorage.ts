import { get, set } from 'idb-keyval';

const KEY = 'padelpulse-chat-audio-playback-rate';

const ALLOWED = [1, 1.5, 2] as const;

function isAllowedRate(v: number): v is (typeof ALLOWED)[number] {
  return ALLOWED.some((a) => Math.abs(a - v) < 0.01);
}

/** jsdom and SSR have no IndexedDB; `idb-keyval` throws on first touch there. */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function getStoredAudioPlaybackRate(): Promise<number> {
  if (!hasIndexedDb()) return 1;
  let v: number | undefined;
  try {
    v = await get<number>(KEY);
  } catch {
    return 1;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return isAllowedRate(v) ? v : 1;
}

export function persistAudioPlaybackRate(rate: number): void {
  if (!hasIndexedDb()) return;
  void set(KEY, rate).catch(() => undefined);
}
