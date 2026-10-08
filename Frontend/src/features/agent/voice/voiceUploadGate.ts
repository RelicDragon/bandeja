import { EnergyVad, type VadOptions } from './energyVad';
import { concatPcm16 } from './pcm16';

/**
 * Decides which 20 ms mic frames go to the server (v2). The server owns turn detection, but
 * streaming silence costs money, so a lenient local VAD gates the upload:
 * - voice likely → send, including the last `prerollMs` (the onset the VAD needed to fire);
 * - after the last voiced frame keep sending for `hangoverMs` (the server needs that silence to
 *   end the turn);
 * - `force` (phase hearing / thinking / speaking) always sends, so the server can hear the end
 *   of the turn and the user barging in.
 * Frames leave in batches of `batchFrames` (fewer emits); closing the gate flushes the batch.
 */

export interface VoiceUploadGateOptions {
  frameMs: number;
  prerollMs: number;
  hangoverMs: number;
  batchFrames: number;
}

export const DEFAULT_UPLOAD_GATE_OPTIONS: VoiceUploadGateOptions = {
  frameMs: 20,
  prerollMs: 400,
  hangoverMs: 1500,
  batchFrames: 3,
};

/** Lower bar than the v1 turn VAD: a missed onset loses words, a false one only costs a little. */
export const LENIENT_VAD_OPTIONS: Partial<VadOptions> = {
  margin: { normal: 6, bargeIn: 20 },
  minDb: { normal: -62, bargeIn: -38 },
  startMs: { normal: 40, bargeIn: 280 },
  endSilenceMs: 300,
  minSpeechMs: 0,
  maxUtteranceMs: Number.POSITIVE_INFINITY,
};

export interface VoiceUploadGateResult {
  /** Ready `voice:audio` payloads, in order. */
  chunks: ArrayBuffer[];
  /** The local VAD heard the start of speech in this frame. */
  voiceStarted: boolean;
}

export class VoiceUploadGate {
  private readonly opts: VoiceUploadGateOptions;
  private readonly vad = new EnergyVad(LENIENT_VAD_OPTIONS);
  private ring: Int16Array[] = [];
  private batch: Int16Array[] = [];
  private open = false;
  private sinceVoiceMs = Number.POSITIVE_INFINITY;

  constructor(options: Partial<VoiceUploadGateOptions> = {}) {
    this.opts = { ...DEFAULT_UPLOAD_GATE_OPTIONS, ...options };
  }

  get sending(): boolean {
    return this.open;
  }

  push(frame: Int16Array, db: number, force: boolean): VoiceUploadGateResult {
    const chunks: ArrayBuffer[] = [];
    const event = this.vad.process(db, this.opts.frameMs);
    const voice = this.vad.speaking;
    this.sinceVoiceMs = voice ? 0 : this.sinceVoiceMs + this.opts.frameMs;
    const send = force || voice || (this.open && this.sinceVoiceMs < this.opts.hangoverMs);

    if (send) {
      if (!this.open) {
        this.open = true;
        for (const f of this.ring) this.add(f, chunks);
        this.ring = [];
      }
      this.add(frame, chunks);
    } else {
      if (this.open) {
        this.open = false;
        this.flushInto(chunks);
      }
      this.ring.push(frame);
      const keep = Math.max(1, Math.round(this.opts.prerollMs / this.opts.frameMs));
      if (this.ring.length > keep) this.ring.splice(0, this.ring.length - keep);
    }
    return { chunks, voiceStarted: event === 'start' };
  }

  /** Muted / waiting on a confirm card: drop everything held; the next frames start fresh. */
  reset(): void {
    this.ring = [];
    this.batch = [];
    this.open = false;
    this.sinceVoiceMs = Number.POSITIVE_INFINITY;
    this.vad.reset();
  }

  private add(frame: Int16Array, chunks: ArrayBuffer[]): void {
    this.batch.push(frame);
    if (this.batch.length >= this.opts.batchFrames) this.flushInto(chunks);
  }

  private flushInto(chunks: ArrayBuffer[]): void {
    if (this.batch.length === 0) return;
    chunks.push(concatPcm16(this.batch));
    this.batch = [];
  }
}
