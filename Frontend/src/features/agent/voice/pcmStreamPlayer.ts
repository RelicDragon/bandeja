import { pcm16ToFloat } from './pcm16';

/**
 * Gapless player for the streamed reply (`voice:audio-out`, PCM16). Chunks are scheduled back
 * to back on the audio clock, in `seq` order per turn (a chunk that arrives early waits for the
 * missing one). One turn plays at a time: a chunk of a newer turn retires the current one, and
 * chunks of retired turns (interrupted, stopped by the server) are dropped.
 */

export interface ScheduledPcm {
  stop(): void;
}

/** The audio clock + output (the engine's AudioContext; a fake in tests). Times in seconds. */
export interface PcmSink {
  currentTime(): number;
  schedulePcm(samples: Float32Array, sampleRate: number, at: number): ScheduledPcm;
}

interface Segment {
  start: number;
  end: number;
  node: ScheduledPcm;
}

/** Head start for the first chunk (and after an underrun), so the next chunk can join gaplessly. */
const LEAD_SEC = 0.06;
const MAX_RETIRED = 32;

export class PcmStreamPlayer {
  private turn: string | null = null;
  private readonly retired = new Set<string>();
  private nextSeq = 0;
  private readonly early = new Map<number, ArrayBuffer>();
  private segments: Segment[] = [];
  private nextTime = 0;
  private receivedSec = 0;
  private ended = false;
  /** Audio-clock time the turn's first chunk starts. */
  private startAt: number | null = null;

  constructor(
    private readonly sink: PcmSink,
    readonly sampleRate: number,
  ) {}

  get turnId(): string | null {
    return this.turn;
  }

  /** Audio-clock time playback of the current turn starts (null: nothing scheduled yet). */
  get startTime(): number | null {
    return this.startAt;
  }

  /** A new turn's audio is next: drops what is left of the previous one. */
  beginTurn(turnId: string): void {
    if (this.turn === turnId) return;
    if (this.turn) this.retire(this.turn);
    this.turn = turnId;
    this.nextSeq = 0;
    this.early.clear();
    this.segments = [];
    this.receivedSec = 0;
    this.ended = false;
    this.startAt = null;
  }

  /** Returns whether the chunk was kept (false: stale turn or duplicate). */
  push(turnId: string, seq: number, pcm: ArrayBuffer): boolean {
    if (this.retired.has(turnId)) return false;
    if (turnId !== this.turn) this.beginTurn(turnId);
    if (seq < this.nextSeq || this.early.has(seq)) return false;
    this.early.set(seq, pcm);
    for (let next = this.early.get(this.nextSeq); next; next = this.early.get(this.nextSeq)) {
      this.early.delete(this.nextSeq);
      this.nextSeq += 1;
      this.schedule(next);
    }
    return true;
  }

  /** `voice:audio-end`: nothing more comes for the turn. */
  end(turnId: string): void {
    if (turnId === this.turn) this.ended = true;
  }

  /** Stop now and drop the turn (interrupt, `voice:stop-playback`). */
  retire(turnId: string): void {
    this.retired.add(turnId);
    if (this.retired.size > MAX_RETIRED) {
      const oldest = this.retired.values().next().value;
      if (oldest !== undefined) this.retired.delete(oldest);
    }
    if (turnId !== this.turn) return;
    for (const s of this.segments) s.node.stop();
    this.segments = this.segments.map((s) => {
      // What was heard stays counted (playedMs of the interrupted turn).
      const now = this.sink.currentTime();
      const end = Math.min(s.end, Math.max(s.start, now));
      return { ...s, end };
    });
    this.early.clear();
    this.ended = true;
    this.nextTime = 0;
  }

  /** Stops whatever is playing (the current turn is retired). */
  flush(): void {
    if (this.turn) this.retire(this.turn);
  }

  /** ms of the current turn actually played so far. */
  playedMs(): number {
    const now = this.sink.currentTime();
    let played = 0;
    for (const s of this.segments) played += Math.max(0, Math.min(now, s.end) - s.start);
    return Math.round(played * 1000);
  }

  /** ms of the current turn's audio received (in order) so far. */
  receivedMs(turnId?: string): number {
    if (turnId !== undefined && turnId !== this.turn) return 0;
    return Math.round(this.receivedSec * 1000);
  }

  /** Every chunk of the current turn arrived (`audio-end`, or it was retired). */
  get complete(): boolean {
    return this.ended;
  }

  /** Audio is scheduled and not finished yet. */
  get playing(): boolean {
    const last = this.segments[this.segments.length - 1];
    return last != null && this.sink.currentTime() < last.end && !this.retired.has(this.turn ?? '');
  }

  /** The turn ended (`audio-end` or retired) and every scheduled chunk has played. */
  get done(): boolean {
    return this.ended && this.early.size === 0 && !this.playing;
  }

  private schedule(pcm: ArrayBuffer): void {
    const samples = pcm16ToFloat(pcm);
    if (samples.length === 0) return;
    const now = this.sink.currentTime();
    const at = this.nextTime > now ? this.nextTime : now + LEAD_SEC;
    const duration = samples.length / this.sampleRate;
    const node = this.sink.schedulePcm(samples, this.sampleRate, at);
    this.segments.push({ start: at, end: at + duration, node });
    this.nextTime = at + duration;
    this.receivedSec += duration;
    if (this.startAt == null) this.startAt = at;
  }
}
