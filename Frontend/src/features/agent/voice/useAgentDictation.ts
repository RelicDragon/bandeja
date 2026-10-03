import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_VOICE_MAX_AUDIO_MS } from '@shared/agentContract';
import { agentApi } from '@/api/agent';
import { useAudioRecorder } from '@/components/audio/useAudioRecorder';

/** Shorter taps are accidental: nothing is uploaded. */
const MIN_DICTATION_MS = 500;
/** Loudness samples kept for the recording strip (newest last). */
export const DICTATION_LEVEL_HISTORY = 28;

/** The recorder's spectrum → one loudness value (speech sits in the lowest bins). */
function loudness(spectrum: readonly number[]): number {
  if (spectrum.length === 0) return 0;
  const speechBins = spectrum.slice(0, Math.max(1, Math.ceil(spectrum.length / 3)));
  return Math.min(1, speechBins.reduce((sum, v) => sum + v, 0) / speechBins.length);
}

export type AgentDictationPhase = 'idle' | 'recording' | 'transcribing';

export type AgentDictationOutcome =
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
  | { kind: 'tooShort' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'micError'; reason: 'denied' | 'insecure' | 'unknown' };

/**
 * Dictation into the agent composer: record → `/voice/transcriptions` → text the user can
 * still edit before sending. Stops by itself at the server's audio cap.
 */
export function useAgentDictation(onOutcome: (outcome: AgentDictationOutcome) => void) {
  const recorder = useAudioRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [history, setHistory] = useState<{ source: readonly number[]; levels: number[] }>({ source: [], levels: [] });
  // A rolling loudness strip, advanced whenever the recorder publishes a new spectrum.
  if (history.source !== recorder.liveLevels) {
    const levels = recorder.isRecording
      ? [...history.levels, loudness(recorder.liveLevels)].slice(-DICTATION_LEVEL_HISTORY)
      : [];
    setHistory({ source: recorder.liveLevels, levels });
  }
  const abortRef = useRef<AbortController | null>(null);
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  const start = useCallback(async () => {
    if (recorder.isRecording || transcribing) return;
    // A refusal surfaces through `recorder.error` (effect below).
    await recorder.start();
  }, [recorder, transcribing]);

  const finish = useCallback(async () => {
    const recording = await recorder.stop();
    if (!recording) return;
    if (recording.durationMs < MIN_DICTATION_MS) {
      onOutcomeRef.current({ kind: 'tooShort' });
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    setTranscribing(true);
    try {
      const { text } = await agentApi.transcribeVoice(recording.blob, recording.durationMs, abort.signal);
      if (abort.signal.aborted) return;
      onOutcomeRef.current(text.trim() ? { kind: 'text', text: text.trim() } : { kind: 'empty' });
    } catch (error) {
      if (!abort.signal.aborted) onOutcomeRef.current({ kind: 'failed', error });
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setTranscribing(false);
    }
  }, [recorder]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setTranscribing(false);
    recorder.cancel();
  }, [recorder]);

  // The recorder's own cap is for voice messages (much longer): stop at the server's.
  useEffect(() => {
    if (recorder.isRecording && recorder.durationMs >= AGENT_VOICE_MAX_AUDIO_MS) void finish();
  }, [recorder.isRecording, recorder.durationMs, finish]);

  useEffect(() => {
    if (recorder.error) onOutcomeRef.current({ kind: 'micError', reason: recorder.error });
  }, [recorder.error]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const phase: AgentDictationPhase = recorder.isRecording ? 'recording' : transcribing ? 'transcribing' : 'idle';
  return { phase, durationMs: recorder.durationMs, levels: history.levels, start, finish, cancel };
}
