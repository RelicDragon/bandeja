/**
 * Server-side energy VAD over the mic stream of `/agent-voice`. Used when the transcription
 * provider does no turn detection: the batch fallback (realtime connection failed) and VAD-less
 * streaming models (`AGENT_VOICE_REALTIME_TURN_DETECTION=none`). The client already applies echo
 * cancellation.
 *
 * Onset thresholds match the app's v1 `energyVad.ts` normal mode (11 dB margin, ≥ −55 dBFS,
 * 100 ms start, 250 ms minimum speech, 30 s cap), but timing differs on purpose:
 * - end silence defaults to 700 ms (v1: 850 ms) and callers pass `AGENT_VOICE_REALTIME_SILENCE_MS`
 *   (default 550 ms; batch fallback +150 ms): end of turn is on the server's latency path, and the
 *   app's upload gate already filters out silence before it gets here;
 * - calibration is 300 ms (v1: 400 ms) so it fits inside the 400 ms pre-roll the upload gate sends
 *   ahead of the first voiced frame, and the first word isn't swallowed by calibration.
 */

export type EnergyVadEvent = 'start' | 'end' | 'discard' | null;

export interface EnergyVadOptions {
  /** dB above the noise floor that counts as voice. */
  marginDb: number;
  /** Never treat anything quieter than this as voice (dBFS). */
  minDb: number;
  /** Voice this long (allowing short dips) starts an utterance. */
  startMs: number;
  /** Silence this long ends it. */
  endSilenceMs: number;
  /** Shorter voiced time is a cough / click: `discard`. */
  minSpeechMs: number;
  /** Hard cap on one utterance. */
  maxUtteranceMs: number;
}

export const DEFAULT_ENERGY_VAD_OPTIONS: EnergyVadOptions = {
  marginDb: 11,
  minDb: -55,
  startMs: 100,
  endSilenceMs: 700,
  minSpeechMs: 250,
  maxUtteranceMs: 30_000,
};

const FLOOR_MIN_DB = -90;
const FLOOR_MAX_DB = -28;
const CALIBRATION_MS = 300;
const HYSTERESIS_DB = 4;

export class EnergyVad {
  private readonly opts: EnergyVadOptions;
  private floor = -60;
  private inSpeech = false;
  private aboveMs = 0;
  private speechMs = 0;
  private silentMs = 0;
  private calibrationLeftMs = CALIBRATION_MS;
  private calibrationSum = 0;
  private calibrationFrames = 0;

  constructor(options: Partial<EnergyVadOptions> = {}) {
    this.opts = { ...DEFAULT_ENERGY_VAD_OPTIONS, ...options };
  }

  get speaking(): boolean {
    return this.inSpeech;
  }

  /** Silence at the end of the utterance that just ended. */
  get trailingSilenceMs(): number {
    return this.silentMs;
  }

  reset(): void {
    this.inSpeech = false;
    this.aboveMs = 0;
    this.speechMs = 0;
    this.silentMs = 0;
  }

  process(db: number, frameMs: number): EnergyVadEvent {
    if (this.calibrationLeftMs > 0 && !this.inSpeech) {
      this.calibrationLeftMs -= frameMs;
      this.calibrationSum += db;
      this.calibrationFrames += 1;
      this.floor = clampFloor(this.calibrationSum / this.calibrationFrames);
      return null;
    }
    const threshold = Math.max(this.floor + this.opts.marginDb, this.opts.minDb);
    if (!this.inSpeech) {
      if (db >= threshold) {
        this.aboveMs += frameMs;
      } else {
        this.aboveMs = Math.max(0, this.aboveMs - frameMs * 0.5);
        const rate = db < this.floor ? 0.2 : 0.01;
        this.floor = clampFloor(this.floor + (db - this.floor) * rate);
      }
      if (this.aboveMs >= this.opts.startMs) {
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
    if (this.silentMs >= this.opts.endSilenceMs || this.speechMs >= this.opts.maxUtteranceMs) {
      const voicedMs = this.speechMs - this.silentMs;
      const silentMs = this.silentMs;
      this.reset();
      this.silentMs = silentMs;
      return voicedMs >= this.opts.minSpeechMs ? 'end' : 'discard';
    }
    return null;
  }
}

function clampFloor(db: number): number {
  return Math.min(FLOOR_MAX_DB, Math.max(FLOOR_MIN_DB, db));
}
