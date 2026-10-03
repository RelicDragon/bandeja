import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { Loader2, Mic, MicOff, X } from 'lucide-react';
import type { AgentVoiceSession, AgentVoiceState } from '@/features/agent/voice/agentVoiceSession';
import { AgentGlyph } from './AgentGlyph';

interface AgentVoiceDockProps {
  state: AgentVoiceState;
  session: AgentVoiceSession;
  onEnd: () => void;
}

/**
 * Replaces the composer during a voice conversation. The chat above keeps showing the reply,
 * cards and the Confirm buttons; the dock shows who is talking and the live captions.
 * The orb follows the loudness of the mic (listening) or the reply (speaking).
 */
export function AgentVoiceDock({ state, session, onEnd }: AgentVoiceDockProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const orbRef = useRef<HTMLSpanElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);
  const { phase, muted, notice } = state;

  // Loudness → orb scale, straight on the DOM (no React render per frame).
  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const { input, output } = session.levels();
      const level = phase === 'speaking' ? output : phase === 'listening' || phase === 'hearing' ? input : 0;
      smooth += (level - smooth) * 0.35;
      if (orbRef.current) orbRef.current.style.transform = `scale(${1 + smooth * 0.22})`;
      if (haloRef.current) {
        haloRef.current.style.transform = `scale(${1 + smooth * 0.6})`;
        haloRef.current.style.opacity = String(0.15 + smooth * 0.5);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [session, phase, reduceMotion]);

  const statusKey = muted ? 'muted' : phase === 'off' ? 'starting' : phase;
  const caption =
    phase === 'speaking'
      ? state.agentCaption
      : phase === 'hearing' || phase === 'transcribing' || phase === 'thinking'
        ? state.userCaption
        : null;
  const orbLabel = muted
    ? t('agent.voice.unmute')
    : phase === 'speaking' || phase === 'thinking'
      ? t('agent.voice.interrupt')
      : phase === 'confirm'
        ? t('agent.voice.keepTalking')
        : t('agent.voice.listeningLabel');
  const busy = phase === 'starting' || phase === 'transcribing';
  const pulsing = !muted && !reduceMotion && (phase === 'listening' || phase === 'thinking');

  return (
    <div className="p-3">
      <div
        className="mx-auto flex max-w-3xl items-center gap-3 rounded-[28px] border border-gray-200 bg-white px-3 py-3 shadow-lg shadow-gray-900/5 dark:border-gray-700 dark:bg-gray-800"
        role="region"
        aria-label={t('agent.voice.title')}
      >
        <button
          type="button"
          onClick={() => session.toggleMute()}
          aria-pressed={muted}
          aria-label={muted ? t('agent.voice.unmute') : t('agent.voice.mute')}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            muted
              ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {muted ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
        </button>

        <button
          type="button"
          onClick={() => session.tap()}
          aria-label={orbLabel}
          className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full"
        >
          <span
            ref={haloRef}
            aria-hidden
            className={`absolute inset-0 rounded-full bg-gradient-to-br from-primary-400 to-violet-500 opacity-20 transition-opacity ${
              pulsing ? 'motion-safe:animate-pulse' : ''
            }`}
          />
          <span
            ref={orbRef}
            aria-hidden
            className={`relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-colors ${
              muted
                ? 'bg-gray-400 dark:bg-gray-600'
                : phase === 'confirm'
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/25'
                  : 'bg-gradient-to-br from-primary-500 to-violet-600 shadow-violet-500/25'
            }`}
          >
            {busy ? <Loader2 size={24} className="animate-spin" /> : <AgentGlyph size={26} />}
          </span>
        </button>

        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{t(`agent.voice.status.${statusKey}`)}</p>
          {notice ? (
            <p className="line-clamp-2 text-xs text-amber-600 dark:text-amber-400">{t(`agent.voice.notice.${notice}`)}</p>
          ) : caption ? (
            <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400" dir="auto">
              {caption}
            </p>
          ) : (
            <p className="truncate text-xs text-gray-400 dark:text-gray-500">{t(`agent.voice.hint.${statusKey}`)}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onEnd}
          aria-label={t('agent.voice.end')}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
    </div>
  );
}
