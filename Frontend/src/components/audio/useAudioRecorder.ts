import { useRef, useState, useCallback, useEffect } from 'react';
import { VOICE_MESSAGE_MAX_MS } from './audioWaveformUtils';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export function useAudioRecorder() {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>([]);
  const [error, setError] = useState<'denied' | 'insecure' | 'unknown' | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const recordingRef = useRef(false);
  const lastLevelsUiRef = useRef(0);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const cleanupAudioGraph = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (tickRef.current != null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const ctx = ctxRef.current;
    ctxRef.current = null;
    analyserRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, []);

  useEffect(
    () => () => {
      cleanupStream();
      cleanupAudioGraph();
    },
    [cleanupStream, cleanupAudioGraph]
  );

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
      setError('insecure');
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('unknown');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const bars = 48;
      const loop = () => {
        const an = analyserRef.current;
        if (!an) return;
        an.getByteFrequencyData(data);
        const step = Math.max(1, Math.floor(data.length / bars));
        const levels: number[] = [];
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
          levels.push(Math.min(1, (sum / step / 255) * 2));
        }
        const now = Date.now();
        if (now - lastLevelsUiRef.current >= 100) {
          lastLevelsUiRef.current = now;
          setLiveLevels(levels);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      startedAtRef.current = Date.now();
      lastLevelsUiRef.current = 0;
      recordingRef.current = true;
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setDurationMs(elapsed);
        if (elapsed >= VOICE_MESSAGE_MAX_MS) {
          const r = recorderRef.current;
          if (r && r.state === 'recording') {
            try {
              r.stop();
            } catch {
              /* noop */
            }
          }
        }
      }, 200);
      rec.start(100);
      setPhase('recording');
      return true;
    } catch {
      cleanupStream();
      cleanupAudioGraph();
      setError('denied');
      return false;
    }
  }, [cleanupStream, cleanupAudioGraph]);

  const stop = useCallback((): Promise<{ blob: Blob; durationMs: number } | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || !recordingRef.current) {
        resolve(null);
        return;
      }
      recordingRef.current = false;
      setPhase('processing');
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const ms = Date.now() - startedAtRef.current;
        cleanupAudioGraph();
        cleanupStream();
        recorderRef.current = null;
        chunksRef.current = [];
        setPhase('idle');
        setLiveLevels([]);
        setDurationMs(0);
        resolve({ blob, durationMs: ms });
      };
      try {
        rec.stop();
      } catch {
        cleanupAudioGraph();
        cleanupStream();
        recorderRef.current = null;
        setPhase('idle');
        resolve(null);
      }
    });
  }, [cleanupAudioGraph, cleanupStream]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    recordingRef.current = false;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
    cleanupAudioGraph();
    cleanupStream();
    recorderRef.current = null;
    chunksRef.current = [];
    setPhase('idle');
    setLiveLevels([]);
    setDurationMs(0);
  }, [cleanupAudioGraph, cleanupStream]);

  return {
    phase,
    durationMs,
    liveLevels,
    error,
    start,
    stop,
    cancel,
    isRecording: phase === 'recording',
  };
}
