/**
 * PCM16 little-endian mono helpers for agent voice v2 (`/agent-voice`): durations, levels,
 * WAV wrapping for the batch fallback, and re-chunking of streamed speech into fixed frames.
 */

/** Bytes per millisecond of PCM16 mono at `rate`. */
export function pcmBytesPerMs(rate: number): number {
  return (rate * 2) / 1000;
}

export function pcmDurationMs(bytes: number, rate: number): number {
  return bytes / pcmBytesPerMs(rate);
}

/** Level of a PCM16 frame in dBFS (−100 for silence). */
export function pcmLevelDb(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / 2);
  if (samples === 0) return -100;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const v = pcm.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples);
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

/** RIFF/WAVE header + PCM16 mono data (what the batch transcription endpoint accepts). */
export function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Collects streamed bytes and hands them out in frames of `frameBytes` (even, whole samples);
 * `flush()` returns the rest (an odd trailing byte is dropped).
 */
export class PcmRechunker {
  private pending: Buffer = Buffer.alloc(0);

  constructor(private readonly frameBytes: number) {}

  push(chunk: Buffer): Buffer[] {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    const out: Buffer[] = [];
    while (this.pending.length >= this.frameBytes) {
      out.push(this.pending.subarray(0, this.frameBytes));
      this.pending = this.pending.subarray(this.frameBytes);
    }
    return out;
  }

  flush(): Buffer | null {
    const even = this.pending.length - (this.pending.length % 2);
    const rest = even > 0 ? this.pending.subarray(0, even) : null;
    this.pending = Buffer.alloc(0);
    return rest;
  }
}
