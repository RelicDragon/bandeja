import { EnergyVad, levelDb, type VadMode } from './energyVad';
import { framesToWavBlob } from './wavEncoder';

/**
 * Browser audio for a voice conversation: one AudioContext for the microphone (capture + VAD)
 * and for playback, so echo cancellation sees what is being played.
 *
 * Capture runs through an AudioWorklet (ScriptProcessor fallback) in ~20 ms frames. A short
 * pre-roll ring keeps the audio from just before the VAD fired, so the first syllable is not
 * clipped. Utterances leave as 16 kHz WAV.
 */

export type VoiceListenMode = 'off' | VadMode;

export type VoiceStartErrorKind = 'denied' | 'insecure' | 'unsupported';

export class VoiceStartError extends Error {
  constructor(readonly kind: VoiceStartErrorKind) {
    super(`voice start failed: ${kind}`);
  }
}

export interface VoiceUtterance {
  blob: Blob;
  durationMs: number;
}

export interface VoiceEngineHandlers {
  onSpeechStart: () => void;
  /** The VAD decided the sound was too short to be speech. */
  onSpeechDiscard: () => void;
  onUtterance: (utterance: VoiceUtterance) => void;
  /** iOS interrupted the audio session (call, Siri) or the context died. */
  onInterrupted: () => void;
}

export interface VoiceEngine {
  start(handlers: VoiceEngineHandlers): Promise<void>;
  setListening(mode: VoiceListenMode): void;
  /** Decodes and plays; resolves when it ends or `stopPlayback` cuts it. */
  play(audio: ArrayBuffer): Promise<void>;
  stopPlayback(): void;
  /** 0..1 microphone and playback loudness, for the dock animation. */
  levels(): { input: number; output: number };
  stop(): void;
}

const FRAME_MS = 20;
const PREROLL_MS = 400;
/** Trailing silence kept after the last word (the VAD waits longer than this to end). */
const TAIL_KEEP_MS = 250;
const WORKLET_NAME = 'pp-voice-capture';

const WORKLET_SOURCE = `
class PpVoiceCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options.processorOptions.frameSize;
    this.buf = new Float32Array(this.size);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.size) {
          this.port.postMessage(this.buf);
          this.buf = new Float32Array(this.size);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', PpVoiceCapture);
`;

type AudioSessionLike = { type: string };

/** iOS 17+ WebKit: play-and-record keeps playback on the loudspeaker while the mic is open. */
function setAudioSessionType(type: 'play-and-record' | 'auto'): void {
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    /* older WebKit: read-only or unknown value */
  }
}

function dbToUnit(db: number): number {
  return Math.max(0, Math.min(1, (db + 60) / 50));
}

function startErrorKind(error: unknown): VoiceStartErrorKind {
  const name = (error as { name?: string })?.name;
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotSupportedError') return 'unsupported';
  return 'denied';
}

export class BrowserVoiceEngine implements VoiceEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private capture: AudioNode | null = null;
  private sink: GainNode | null = null;
  private outAnalyser: AnalyserNode | null = null;
  private outData: Float32Array<ArrayBuffer> | null = null;
  private handlers: VoiceEngineHandlers | null = null;
  private readonly vad = new EnergyVad();
  private mode: VoiceListenMode = 'off';
  private preroll: Float32Array[] = [];
  private prerollMs = 0;
  private utterance: Float32Array[] | null = null;
  private inputLevel = 0;
  private playing: AudioBufferSourceNode | null = null;
  private finishPlaying: (() => void) | null = null;
  private playbackGen = 0;
  private stopped = false;

  async start(handlers: VoiceEngineHandlers): Promise<void> {
    this.handlers = handlers;
    if (typeof window === 'undefined') throw new VoiceStartError('unsupported');
    if (!window.isSecureContext && window.location.hostname !== 'localhost') throw new VoiceStartError('insecure');
    const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !Ctx) throw new VoiceStartError('unsupported');

    // Created and resumed before any await: iOS only unlocks audio inside the user's tap.
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    void ctx.resume().catch(() => {});
    setAudioSessionType('play-and-record');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (error) {
      this.stop();
      throw new VoiceStartError(startErrorKind(error));
    }
    if (this.stopped) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});

    this.source = ctx.createMediaStreamSource(stream);
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(ctx.destination);
    this.capture = await this.createCaptureNode(ctx);
    this.source.connect(this.capture);
    this.capture.connect(this.sink);

    this.outAnalyser = ctx.createAnalyser();
    this.outAnalyser.fftSize = 512;
    this.outData = new Float32Array(this.outAnalyser.fftSize);
    this.outAnalyser.connect(ctx.destination);

    ctx.onstatechange = () => {
      const state = ctx.state as AudioContextState | 'interrupted';
      if (!this.stopped && (state === 'interrupted' || state === 'closed')) this.handlers?.onInterrupted();
    };
  }

  setListening(mode: VoiceListenMode): void {
    const wasOff = this.mode === 'off';
    this.mode = mode;
    if (mode === 'off') {
      this.vad.reset();
      this.utterance = null;
      return;
    }
    // Barge-in → normal keeps the utterance the user already started.
    if (wasOff) {
      this.vad.reset();
      this.vad.calibrate();
    }
    this.vad.setMode(mode);
  }

  async play(audio: ArrayBuffer): Promise<void> {
    const ctx = this.ctx;
    const out = this.outAnalyser;
    if (!ctx || !out || this.stopped) return;
    const gen = this.playbackGen;
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(audio.slice(0));
    } catch {
      return;
    }
    if (gen !== this.playbackGen || this.stopped) return;
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    await new Promise<void>((resolve) => {
      const node = ctx.createBufferSource();
      node.buffer = decoded;
      node.connect(out);
      const done = () => {
        node.onended = null;
        if (this.playing === node) {
          this.playing = null;
          this.finishPlaying = null;
        }
        resolve();
      };
      node.onended = done;
      this.playing = node;
      this.finishPlaying = done;
      node.start();
    });
  }

  stopPlayback(): void {
    this.playbackGen += 1;
    const node = this.playing;
    const finish = this.finishPlaying;
    this.playing = null;
    this.finishPlaying = null;
    if (node) {
      try {
        node.stop();
      } catch {
        /* already ended */
      }
    }
    finish?.();
  }

  levels(): { input: number; output: number } {
    let output = 0;
    if (this.outAnalyser && this.outData && this.playing) {
      this.outAnalyser.getFloatTimeDomainData(this.outData);
      output = dbToUnit(levelDb(this.outData));
    }
    return { input: this.mode === 'off' ? 0 : this.inputLevel, output };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.stopPlayback();
    this.mode = 'off';
    this.utterance = null;
    try {
      this.source?.disconnect();
      this.capture?.disconnect();
      this.sink?.disconnect();
      this.outAnalyser?.disconnect();
    } catch {
      /* already torn down */
    }
    if (this.capture instanceof AudioWorkletNode) this.capture.port.onmessage = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      ctx.onstatechange = null;
      void ctx.close().catch(() => {});
    }
    setAudioSessionType('auto');
  }

  private async createCaptureNode(ctx: AudioContext): Promise<AudioNode> {
    const frameSize = Math.round((ctx.sampleRate * FRAME_MS) / 1000);
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { frameSize },
        });
        node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data, ctx.sampleRate);
        return node;
      } catch {
        // Fall through to the ScriptProcessor (deprecated, but everywhere).
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const processor = ctx.createScriptProcessor(1024, 1, 1);
    processor.onaudioprocess = (e) => this.onFrame(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate);
    return processor;
  }

  private onFrame(frame: Float32Array, sampleRate: number): void {
    if (this.stopped) return;
    const frameMs = (frame.length / sampleRate) * 1000;
    const db = levelDb(frame);
    this.inputLevel = dbToUnit(db);

    this.preroll.push(frame);
    this.prerollMs += frameMs;
    while (this.prerollMs - frameMs * 0.5 > PREROLL_MS && this.preroll.length > 1) {
      const dropped = this.preroll.shift();
      this.prerollMs -= dropped ? (dropped.length / sampleRate) * 1000 : 0;
    }
    if (this.mode === 'off') return;

    if (this.utterance) this.utterance.push(frame);
    const event = this.vad.process(db, frameMs);
    if (event === 'start') {
      this.utterance = [...this.preroll];
      this.handlers?.onSpeechStart();
    } else if (event === 'discard') {
      this.utterance = null;
      this.handlers?.onSpeechDiscard();
    } else if (event === 'end' && this.utterance) {
      const frames = this.utterance;
      this.utterance = null;
      const trailingFrames = Math.max(0, Math.floor((this.vad.lastTrailingSilenceMs - TAIL_KEEP_MS) / frameMs));
      const kept = frames.slice(0, Math.max(1, frames.length - trailingFrames));
      this.handlers?.onUtterance(framesToWavBlob(kept, sampleRate));
    }
  }
}
