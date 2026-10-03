import { describe, expect, it } from 'vitest';
import { EnergyVad, levelDb, type VadEvent } from './energyVad';
import { concatFrames, downsample, encodeWav, VOICE_WAV_SAMPLE_RATE } from './wavEncoder';

const FRAME = 20;

function run(vad: EnergyVad, dbs: number[]): VadEvent[] {
  return dbs.map((db) => vad.process(db, FRAME)).filter((e) => e != null);
}

const repeat = (db: number, ms: number) => Array.from({ length: Math.round(ms / FRAME) }, () => db);

describe('EnergyVad', () => {
  it('starts on speech above the learned floor and ends after the silence window', () => {
    const vad = new EnergyVad();
    expect(run(vad, repeat(-70, 1000))).toEqual([]);
    expect(run(vad, repeat(-30, 600))).toEqual(['start']);
    expect(vad.speaking).toBe(true);
    expect(run(vad, repeat(-70, 840))).toEqual([]);
    expect(run(vad, repeat(-70, 40))).toEqual(['end']);
    expect(vad.lastTrailingSilenceMs).toBeGreaterThanOrEqual(850);
  });

  it('short pauses between words do not end the utterance', () => {
    const vad = new EnergyVad();
    run(vad, repeat(-70, 500));
    const events = run(vad, [...repeat(-30, 400), ...repeat(-70, 300), ...repeat(-30, 400), ...repeat(-70, 300), ...repeat(-30, 200)]);
    expect(events).toEqual(['start']);
  });

  it('a click is discarded, not sent', () => {
    const vad = new EnergyVad({ startMs: { normal: 40, bargeIn: 280 } });
    run(vad, repeat(-70, 500));
    expect(run(vad, [...repeat(-25, 60), ...repeat(-70, 900)])).toEqual(['start', 'discard']);
  });

  it('adapts to a noisy room: steady noise never starts an utterance', () => {
    const vad = new EnergyVad();
    expect(run(vad, repeat(-45, 5000))).toEqual([]);
    expect(vad.noiseFloorDb).toBeGreaterThan(-50);
    expect(run(vad, repeat(-25, 400))).toEqual(['start']);
  });

  it('barge-in needs louder and longer speech than normal listening', () => {
    const normal = new EnergyVad();
    const bargeIn = new EnergyVad();
    bargeIn.setMode('bargeIn');
    const echo = [...repeat(-70, 1000), ...repeat(-45, 300)];
    expect(run(normal, echo)).toEqual(['start']);
    expect(run(bargeIn, echo)).toEqual([]);
    expect(run(bargeIn, repeat(-20, 400))).toEqual(['start']);
  });

  it('caps one utterance', () => {
    const vad = new EnergyVad({ maxUtteranceMs: 2000 });
    run(vad, repeat(-70, 500));
    // Speech going on past the cap starts the next utterance (the session is off by then).
    expect(run(vad, repeat(-30, 2500)).slice(0, 2)).toEqual(['start', 'end']);
  });
});

describe('levelDb', () => {
  it('measures RMS in dBFS', () => {
    expect(levelDb(new Float32Array(100))).toBe(-100);
    expect(levelDb(new Float32Array(100).fill(1))).toBeCloseTo(0);
    expect(levelDb(new Float32Array(100).fill(0.1))).toBeCloseTo(-20);
  });
});

describe('wav encoding', () => {
  it('downsamples 48 kHz to 16 kHz by averaging', () => {
    const input = new Float32Array([0, 0.3, 0.6, 0.9, 0.9, 0.9]);
    expect(Array.from(downsample(input, 48_000))).toEqual([expect.closeTo(0.3), expect.closeTo(0.9)]);
    expect(downsample(input, 16_000)).toBe(input);
  });

  it('concatenates frames in order', () => {
    expect(Array.from(concatFrames([new Float32Array([1, 2]), new Float32Array([3])]))).toEqual([1, 2, 3]);
  });

  it('writes a PCM16 mono header and clamps samples', () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), VOICE_WAV_SAMPLE_RATE));
    const ascii = (offset: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));
    expect(ascii(0)).toBe('RIFF');
    expect(ascii(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});
