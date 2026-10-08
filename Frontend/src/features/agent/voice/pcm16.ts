/**
 * PCM helpers for the realtime voice loop (v2, `@shared/agentVoiceRealtime`): the microphone
 * runs at the AudioContext's rate (44.1 / 48 kHz), the wire carries 24 kHz PCM16 mono in 20 ms
 * frames, and the reply comes back as 24 kHz PCM16.
 */

/**
 * Streaming linear-interpolation resampler: state (fractional position, previous samples)
 * carries across chunks, so chunk boundaries don't click. Downsampling first runs a small
 * [1 2 1] / 4 low-pass, enough for speech going to a recognizer.
 */
export class StreamResampler {
  private readonly ratio: number;
  private readonly smooth: boolean;
  /** Input position of the next output sample, relative to the current chunk (−1 = `last`). */
  private pos = 0;
  private last = 0;
  private h1 = 0;
  private h2 = 0;

  constructor(
    readonly inRate: number,
    readonly outRate: number,
  ) {
    this.ratio = inRate / outRate;
    this.smooth = this.ratio >= 1.5;
  }

  process(chunk: Float32Array): Float32Array {
    if (this.inRate === this.outRate) return chunk.slice();
    const input = this.smooth ? this.lowPass(chunk) : chunk;
    const n = input.length;
    if (n === 0) return new Float32Array(0);
    const out = new Float32Array(Math.ceil((n - this.pos) / this.ratio) + 1);
    let count = 0;
    let p = this.pos;
    for (;;) {
      const i = Math.floor(p);
      if (i + 1 > n - 1) break;
      const f = p - i;
      const a = i < 0 ? this.last : input[i];
      const b = input[i + 1];
      out[count++] = a + (b - a) * f;
      p += this.ratio;
    }
    this.pos = p - n;
    this.last = input[n - 1];
    return out.subarray(0, count);
  }

  private lowPass(chunk: Float32Array): Float32Array {
    const out = new Float32Array(chunk.length);
    let h1 = this.h1;
    let h2 = this.h2;
    for (let k = 0; k < chunk.length; k++) {
      const x = chunk[k];
      out[k] = (h2 + 2 * h1 + x) / 4;
      h2 = h1;
      h1 = x;
    }
    this.h1 = h1;
    this.h2 = h2;
    return out;
  }
}

/** Float [-1, 1] → PCM16 (clamped). Int16Array is little-endian on every platform the app runs on. */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** PCM16 little-endian bytes → Float [-1, 1]. A trailing odd byte is ignored. */
export function pcm16ToFloat(bytes: ArrayBuffer): Float32Array {
  const view = new DataView(bytes);
  const count = bytes.byteLength >> 1;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const v = view.getInt16(i * 2, true);
    out[i] = v < 0 ? v / 0x8000 : v / 0x7fff;
  }
  return out;
}

/** Cuts a PCM16 stream into fixed-size frames (20 ms at 24 kHz = 480 samples). */
export class PcmFramer {
  private buf: Int16Array;
  private n = 0;

  constructor(readonly frameSamples: number) {
    this.buf = new Int16Array(frameSamples);
  }

  push(samples: Int16Array): Int16Array[] {
    const frames: Int16Array[] = [];
    let offset = 0;
    while (offset < samples.length) {
      const take = Math.min(this.frameSamples - this.n, samples.length - offset);
      this.buf.set(samples.subarray(offset, offset + take), this.n);
      this.n += take;
      offset += take;
      if (this.n === this.frameSamples) {
        frames.push(this.buf);
        this.buf = new Int16Array(this.frameSamples);
        this.n = 0;
      }
    }
    return frames;
  }
}

/** Frames → one ArrayBuffer (one `voice:audio` emit). */
export function concatPcm16(frames: readonly Int16Array[]): ArrayBuffer {
  const total = frames.reduce((sum, f) => sum + f.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const f of frames) {
    out.set(f, offset);
    offset += f.length;
  }
  return out.buffer;
}
