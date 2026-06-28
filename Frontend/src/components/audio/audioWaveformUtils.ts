import { isCapacitor } from '@/utils/capacitor';

export const DEFAULT_WAVEFORM_BARS = 60;
export const MAX_WAVEFORM_BARS = 80;
export const DEFAULT_MEDIA_BASE_URL = 'https://bandeja.me';

/** Must match server `MessageService` voice duration cap */
export const VOICE_MESSAGE_MAX_MS = 30 * 60 * 1000;

export function placeholderWaveform(barCount = 48): number[] {
  return Array.from({ length: barCount }, () => 0.12);
}

export async function extractWaveformPeaksFromBlob(blob: Blob, barCount = DEFAULT_WAVEFORM_BARS): Promise<number[]> {
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(buf.slice(0));
  } finally {
    await ctx.close().catch(() => {});
  }
  const data = buffer.getChannelData(0);
  const n = Math.min(barCount, MAX_WAVEFORM_BARS);
  const segment = Math.max(1, Math.floor(data.length / n));
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < n; i++) {
    const start = i * segment;
    let sum = 0;
    for (let j = 0; j < segment; j++) {
      const v = data[start + j] ?? 0;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / segment);
    peaks.push(rms);
    if (rms > max) max = rms;
  }
  const norm = max > 0 ? 1 / max : 1;
  return peaks.map((p) => Math.min(1, p * norm));
}

export function resolveChatMediaUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const configuredBase = import.meta.env.VITE_MEDIA_BASE_URL || '';
  const base =
    isCapacitor() && /localhost|127\.0\.0\.1/i.test(configuredBase)
      ? DEFAULT_MEDIA_BASE_URL
      : configuredBase;
  if (!base) return pathOrUrl;
  return `${base.replace(/\/$/, '')}/${pathOrUrl.replace(/^\//, '')}`;
}

export function formatDurationClock(ms: number, locale?: string): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const fmt = (value: number, minDigits: number) => {
    try {
      return new Intl.NumberFormat(locale, {
        minimumIntegerDigits: minDigits,
        maximumFractionDigits: 0,
        useGrouping: false,
      }).format(value);
    } catch {
      return String(value).padStart(minDigits, '0');
    }
  };
  if (h > 0) {
    return `${fmt(h, 1)}:${fmt(m, 2)}:${fmt(s, 2)}`;
  }
  return `${fmt(m, 1)}:${fmt(s, 2)}`;
}
