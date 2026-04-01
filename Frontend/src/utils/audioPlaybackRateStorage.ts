import { get, set } from 'idb-keyval';

const KEY = 'padelpulse-chat-audio-playback-rate';

const ALLOWED = [1, 1.5, 2] as const;

function isAllowedRate(v: number): v is (typeof ALLOWED)[number] {
  return ALLOWED.some((a) => Math.abs(a - v) < 0.01);
}

export async function getStoredAudioPlaybackRate(): Promise<number> {
  const v = await get<number>(KEY);
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return isAllowedRate(v) ? v : 1;
}

export function persistAudioPlaybackRate(rate: number): void {
  void set(KEY, rate);
}
