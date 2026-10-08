import { describe, expect, it } from 'vitest';
import { PcmFramer, StreamResampler, concatPcm16, floatToPcm16, pcm16ToFloat } from './pcm16';
import { PcmStreamPlayer, type PcmSink } from './pcmStreamPlayer';
import { VoiceUploadGate } from './voiceUploadGate';

const sine = (rate: number, hz: number, samples: number, offset = 0) =>
  Float32Array.from({ length: samples }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * (i + offset)) / rate));

function zeroCrossings(samples: Float32Array): number {
  let n = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 !== samples[i] < 0) n++;
  return n;
}

describe('PCM16', () => {
  it('encodes floats with clamping and decodes them back (little-endian)', () => {
    const pcm = floatToPcm16(Float32Array.from([0, 1, -1, 2, -2, 0.5]));
    expect(Array.from(pcm)).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
    const bytes = new Uint8Array(pcm.buffer);
    expect([bytes[2], bytes[3]]).toEqual([0xff, 0x7f]);
    const back = pcm16ToFloat(pcm.buffer);
    expect(back[1]).toBeCloseTo(1, 4);
    expect(back[2]).toBe(-1);
    expect(back[5]).toBeCloseTo(0.5, 3);
  });

  it('ignores a trailing odd byte', () => {
    expect(pcm16ToFloat(new Uint8Array([0, 0x40, 7]).buffer)).toHaveLength(1);
  });

  it('frames a stream into fixed 20 ms frames and concatenates batches', () => {
    const framer = new PcmFramer(480);
    expect(framer.push(new Int16Array(300))).toHaveLength(0);
    const frames = framer.push(new Int16Array(700).fill(3));
    expect(frames.map((f) => f.length)).toEqual([480, 480]);
    expect(concatPcm16(frames).byteLength).toBe(1920);
  });
});

describe('StreamResampler', () => {
  it('48 kHz → 24 kHz halves the length and keeps the pitch', () => {
    const r = new StreamResampler(48_000, 24_000);
    const out = r.process(sine(48_000, 440, 48_000));
    expect(Math.abs(out.length - 24_000)).toBeLessThanOrEqual(1);
    // 440 Hz → ~880 zero crossings per second at any rate.
    expect(Math.abs(zeroCrossings(out) - 880)).toBeLessThanOrEqual(4);
  });

  it('44.1 kHz → 24 kHz in 20 ms chunks matches one pass (no seams)', () => {
    const input = sine(44_100, 300, 44_100);
    const whole = new StreamResampler(44_100, 24_000).process(input);
    const chunked = new StreamResampler(44_100, 24_000);
    const parts: number[] = [];
    for (let i = 0; i < input.length; i += 882) parts.push(...chunked.process(input.subarray(i, i + 882)));
    expect(Math.abs(parts.length - whole.length)).toBeLessThanOrEqual(1);
    for (let i = 0; i < Math.min(parts.length, whole.length); i += 97) expect(parts[i]).toBeCloseTo(whole[i], 5);
  });

  it('same rate passes through', () => {
    const input = sine(24_000, 200, 480);
    expect(Array.from(new StreamResampler(24_000, 24_000).process(input))).toEqual(Array.from(input));
  });
});

describe('VoiceUploadGate', () => {
  const frame = () => new Int16Array(480);
  const calibrate = (gate: VoiceUploadGate) => {
    for (let i = 0; i < 25; i++) gate.push(frame(), -70, false);
  };

  it('sends nothing while quiet', () => {
    const gate = new VoiceUploadGate();
    calibrate(gate);
    for (let i = 0; i < 50; i++) expect(gate.push(frame(), -70, false).chunks).toEqual([]);
  });

  it('opens on voice with 400 ms of pre-roll, batches 3 frames, holds 1.5 s after silence', () => {
    const gate = new VoiceUploadGate();
    calibrate(gate);
    let frames = 0;
    let started = 0;
    const push = (db: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const r = gate.push(frame(), db, false);
        frames += r.chunks.reduce((sum, c) => sum + c.byteLength / 960, 0);
        if (r.voiceStarted) started++;
      }
    };
    push(-20, 3);
    expect(started).toBe(1);
    expect(frames).toBeGreaterThanOrEqual(21); // 20 pre-roll + the onset
    const atOpen = frames;
    push(-70, 60); // 1.2 s: still inside the hangover
    expect(frames).toBeGreaterThan(atOpen + 50);
    push(-70, 40);
    expect(gate.sending).toBe(false);
    const closed = frames;
    push(-70, 20);
    expect(frames).toBe(closed);
  });

  it('force streams silence too', () => {
    const gate = new VoiceUploadGate();
    calibrate(gate);
    let bytes = 0;
    for (let i = 0; i < 9; i++) bytes += gate.push(frame(), -70, true).chunks.reduce((n, c) => n + c.byteLength, 0);
    // The first forced frame flushes the pre-roll ring too.
    expect(bytes).toBeGreaterThanOrEqual(9 * 960);
  });
});

describe('PcmStreamPlayer', () => {
  function sink() {
    const nodes: { at: number; len: number; stopped: boolean }[] = [];
    let now = 0;
    const s: PcmSink & { nodes: typeof nodes; set: (t: number) => void } = {
      nodes,
      set: (t) => (now = t),
      currentTime: () => now,
      schedulePcm: (samples, _rate, at) => {
        const node = { at, len: samples.length, stopped: false };
        nodes.push(node);
        return { stop: () => (node.stopped = true) };
      },
    };
    return s;
  }
  const chunk = (ms: number) => new Int16Array((24 * ms) | 0).buffer;

  it('schedules back to back, re-leads after an underrun, tracks played ms', () => {
    const s = sink();
    const p = new PcmStreamPlayer(s, 24_000);
    p.push('t', 0, chunk(100));
    p.push('t', 1, chunk(100));
    expect(s.nodes[1].at).toBeCloseTo(s.nodes[0].at + 0.1, 6);
    s.set(1);
    p.push('t', 2, chunk(100));
    expect(s.nodes[2].at).toBeGreaterThan(1);
    s.set(5);
    expect(p.playedMs()).toBe(300);
    expect(p.receivedMs('t')).toBe(300);
    expect(p.receivedMs('other')).toBe(0);
  });

  it('drops duplicates and anything of a retired turn; done once ended and played', () => {
    const s = sink();
    const p = new PcmStreamPlayer(s, 24_000);
    expect(p.push('t', 0, chunk(100))).toBe(true);
    expect(p.push('t', 0, chunk(100))).toBe(false);
    p.end('t');
    expect(p.done).toBe(false);
    s.set(1);
    expect(p.done).toBe(true);
    p.retire('t');
    expect(p.push('t', 1, chunk(100))).toBe(false);
  });
});
