import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentVoiceController } from '@/features/agent/voice/agentVoiceController';
import type {
  AgentVoiceReply,
  AgentVoiceTransportKind,
  AgentVoiceTurnTimings,
} from '@/features/agent/voice/agentVoiceViewState';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * What the user is saying, as the server hears it (realtime voice): a ghost of the user bubble
 * at the end of the chat — dashed while partial, solid once final — until the stored message
 * of the turn's run replaces it.
 */
export function AgentVoiceGhostBubble({ text, final }: { text: string; final: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="agent-voice-ghost flex justify-end" data-final={final ? 'true' : 'false'} aria-label={t('agent.voice.liveCaptionLabel')}>
      <div
        dir="auto"
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md px-3.5 py-2 text-[15px] leading-relaxed transition-colors duration-300 ${
          final
            ? 'bg-primary-600 text-white opacity-70'
            : 'border border-dashed border-primary-400/70 bg-primary-50/80 text-primary-900 dark:border-primary-500/50 dark:bg-primary-950/40 dark:text-primary-100'
        }`}
      >
        {text}
        {final ? null : (
          <span className="agent-voice-ghost-dots ms-1 inline-flex gap-0.5 align-middle" aria-hidden>
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
          </span>
        )}
      </div>
    </div>
  );
}

/** ms per character when the end of the line isn't known yet (TTS speaks ~14 chars / s). */
const EST_MS_PER_CHAR = 70;

/**
 * The reply sentence being spoken, karaoke-style: words already spoken are solid, the rest
 * waits in grey. The sentence comes from the state; the word position from the playback clock
 * (polled per frame, re-rendering only when the highlighted word changes).
 */
export function AgentVoiceKaraoke({ reply, session }: { reply: AgentVoiceReply; session: AgentVoiceController }) {
  const reducedMotion = usePrefersReducedMotion();
  const index = reply.lines.findIndex((l) => l.seq === reply.activeSeq);
  const line = index >= 0 ? reply.lines[index] : null;
  const next = index >= 0 ? reply.lines[index + 1] : undefined;
  const words = useMemo(() => (line ? line.text.split(/(\s+)/).filter((w) => w.length > 0) : []), [line]);
  const [spoken, setSpoken] = useState(0);

  useEffect(() => {
    if (!line) return;
    if (reducedMotion) {
      setSpoken(words.length);
      return;
    }
    const total = line.text.length;
    let raf = 0;
    const tick = () => {
      const pos = session.playbackPosition();
      let chars = total;
      if (pos && pos.turnId === reply.turnId) {
        const end = next ? next.startMs : pos.complete ? pos.receivedMs : Math.max(pos.receivedMs, line.startMs + total * EST_MS_PER_CHAR);
        const span = Math.max(1, end - line.startMs);
        chars = Math.round(Math.max(0, Math.min(1, (pos.playedMs - line.startMs) / span)) * total);
      }
      let count = 0;
      let seen = 0;
      for (const w of words) {
        seen += w.length;
        if (seen > chars) break;
        count += 1;
      }
      setSpoken(count);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [line, next, words, reply.turnId, session, reducedMotion]);

  if (!line) return null;
  return (
    <p className="agent-voice-caption-swap line-clamp-3 text-center text-[15px] font-medium leading-snug" dir="auto">
      {words.map((w, i) => (
        <span
          key={i}
          className={`agent-voice-karaoke-word ${
            i < spoken ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {w}
        </span>
      ))}
    </p>
  );
}

/**
 * Dev-only: the latest turn's timeline (client + server marks), each as +ms from the first.
 * Mark names stay untranslated on purpose (they match `AgentVoiceTimingMark`).
 */
export function AgentVoiceLatencyStrip({
  timings,
  transport,
}: {
  timings: AgentVoiceTurnTimings | null;
  transport: AgentVoiceTransportKind | null;
}) {
  const marks = timings
    ? Object.entries(timings.marks)
        .filter((e): e is [string, number] => typeof e[1] === 'number')
        .sort((a, b) => a[1] - b[1])
    : [];
  const origin = marks[0]?.[1] ?? 0;
  return (
    <div
      className="mt-1 w-full overflow-x-auto whitespace-nowrap rounded-lg bg-gray-900/[0.04] px-2 py-1 font-mono text-[10px] text-gray-500 dark:bg-white/[0.05] dark:text-gray-400"
      data-testid="agent-voice-latency"
    >
      <span className="font-semibold">{transport ?? '—'}</span>
      {marks.map(([name, at]) => (
        <span key={name} className="ms-2">
          {name} <span className="text-gray-700 dark:text-gray-200">+{at - origin}</span>
        </span>
      ))}
    </div>
  );
}
