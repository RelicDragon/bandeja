/**
 * Energy-based voice activity detection with an adaptive noise floor. Fed one frame level
 * (dBFS of ~20 ms of microphone audio) at a time; says when an utterance starts and ends.
 *
 * - `normal`: listening for the user's turn.
 * - `bargeIn`: the assistant is talking. The speaker leaks into the microphone even with echo
 *   cancellation, so the user must be clearly louder than the floor, for longer, to interrupt.
 */
export type VadMode = 'normal' | 'bargeIn';

export type VadEvent = 'start' | 'end' | 'discard' | null;

export interface VadOptions {
  /** dB above the noise floor that counts as voice. */
  margin: Record<VadMode, number>;
  /** Never treat anything quieter than this as voice (dBFS). */
  minDb: Record<VadMode, number>;
  /** Voice this long (allowing short dips) starts an utterance. */
  startMs: Record<VadMode, number>;
  /** Silence this long ends it. */
  endSilenceMs: number;
  /** Shorter voiced time is a cough / click: `discard`. */
  minSpeechMs: number;
  /** Hard cap on one utterance. */
  maxUtteranceMs: number;
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  margin: { normal: 11, bargeIn: 20 },
  minDb: { normal: -55, bargeIn: -38 },
  startMs: { normal: 100, bargeIn: 280 },
  endSilenceMs: 850,
  minSpeechMs: 250,
  maxUtteranceMs: 30_000,
};

const FLOOR_MIN_DB = -90;
/** After (re)starting, only learn the room for this long: steady noise must not start a turn. */
const CALIBRATION_MS = 400;
const FLOOR_MAX_DB = -28;
/** End-of-speech hysteresis: once speaking, slightly quieter still counts as voice. */
const HYSTERESIS_DB = 4;

export function levelDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

export class EnergyVad {
  private readonly opts: VadOptions;
  private mode: VadMode = 'normal';
  private floor = -60;
  private inSpeech = false;
  private aboveMs = 0;
  private speechMs = 0;
  private silentMs = 0;
  private trailingSilenceMs = 0;
  private calibrationLeftMs = CALIBRATION_MS;
  private calibrationSum = 0;
  private calibrationFrames = 0;

  constructor(options: Partial<VadOptions> = {}) {
    this.opts = { ...DEFAULT_VAD_OPTIONS, ...options };
  }

  /** Re-learn the noise floor from the next frames (listening resumed: the room may have changed). */
  calibrate(): void {
    this.calibrationLeftMs = CALIBRATION_MS;
    this.calibrationSum = 0;
    this.calibrationFrames = 0;
  }

  get speaking(): boolean {
    return this.inSpeech;
  }

  /** Silence at the end of the last finished utterance (trim it before upload). */
  get lastTrailingSilenceMs(): number {
    return this.trailingSilenceMs;
  }

  get noiseFloorDb(): number {
    return this.floor;
  }

  setMode(mode: VadMode): void {
    this.mode = mode;
  }

  /** Forget the current utterance (keeps the learned noise floor). */
  reset(): void {
    this.inSpeech = false;
    this.aboveMs = 0;
    this.speechMs = 0;
    this.silentMs = 0;
  }

  threshold(): number {
    return Math.max(this.floor + this.opts.margin[this.mode], this.opts.minDb[this.mode]);
  }

  process(db: number, frameMs: number): VadEvent {
    if (this.calibrationLeftMs > 0 && !this.inSpeech) {
      this.calibrationLeftMs -= frameMs;
      this.calibrationSum += db;
      this.calibrationFrames += 1;
      const mean = this.calibrationSum / this.calibrationFrames;
      this.floor = Math.min(FLOOR_MAX_DB, Math.max(FLOOR_MIN_DB, mean));
      return null;
    }
    const threshold = this.threshold();
    if (!this.inSpeech) {
      if (db >= threshold) {
        this.aboveMs += frameMs;
      } else {
        // Short dips between syllables don't reset the onset, they only slow it down.
        this.aboveMs = Math.max(0, this.aboveMs - frameMs * 0.5);
        this.adaptFloor(db);
      }
      if (this.aboveMs >= this.opts.startMs[this.mode]) {
        this.inSpeech = true;
        this.speechMs = this.aboveMs;
        this.silentMs = 0;
        return 'start';
      }
      return null;
    }

    this.speechMs += frameMs;
    if (db >= threshold - HYSTERESIS_DB) this.silentMs = 0;
    else this.silentMs += frameMs;

    const timedOut = this.speechMs >= this.opts.maxUtteranceMs;
    if (this.silentMs >= this.opts.endSilenceMs || timedOut) {
      const voicedMs = this.speechMs - this.silentMs;
      this.trailingSilenceMs = this.silentMs;
      this.reset();
      return voicedMs >= this.opts.minSpeechMs ? 'end' : 'discard';
    }
    return null;
  }

  /** Fast down (a quieter room is learned at once), slow up (speech doesn't become "noise"). */
  private adaptFloor(db: number): void {
    const rate = db < this.floor ? 0.2 : 0.01;
    this.floor = Math.min(FLOOR_MAX_DB, Math.max(FLOOR_MIN_DB, this.floor + (db - this.floor) * rate));
  }
}
