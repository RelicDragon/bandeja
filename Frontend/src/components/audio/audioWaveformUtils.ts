export const DEFAULT_WAVEFORM_BARS = 60;
export const MAX_WAVEFORM_BARS = 80;

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
  const base = import.meta.env.VITE_MEDIA_BASE_URL || '';
  if (!base) return pathOrUrl;
  return `${base.replace(/\/$/, '')}/${pathOrUrl.replace(/^\//, '')}`;
}

export function formatDurationClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
