import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Keyboard, Loader2, Mic, MicOff, X } from 'lucide-react';
import type { AgentVoiceController } from '@/features/agent/voice/agentVoiceController';
import type { AgentVoiceNotice } from '@/features/agent/voice/agentVoiceSession';
import type { AgentVoiceViewState } from '@/features/agent/voice/agentVoiceViewState';
import { hapticError, hapticSelection } from '@/utils/haptics';
import { AgentOrb, type AgentOrbMode } from './AgentOrb';
import { agentVoiceDebugEnabled } from '@/features/agent/voice/agentVoiceDebug';
import { AgentVoiceKaraoke, AgentVoiceLatencyStrip } from './AgentVoiceCaptions';

interface AgentVoiceDockProps {
  state: AgentVoiceViewState;
  session: AgentVoiceController;
  onEnd: () => void;
  /** Leave voice mode for the composer, focused (runs inside the tap: the keyboard opens on iOS). */
  onTypeInstead: () => void;
  /** Scroll the pending confirmation card into view. */
  onShowCard: () => void;
  /** Enter / exit animation (`styles/motion/agent-voice.css`). */
  dataState: 'open' | 'closed';
}

/** Notices that mean "that turn failed" (red orb) rather than "fyi". */
const ERROR_NOTICES = new Set<AgentVoiceNotice>(['transcribeFailed', 'sendFailed', 'runFailed', 'speechFailed', 'chatBusy']);

const ORB_SIZE = 92;

function lastConfirmLine(state: AgentVoiceViewState): string | null {
  const lines = state.reply?.lines ?? [];
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].kind === 'confirm') return lines[i].text;
  return null;
}

/**
 * Voice mode: replaces the composer at the bottom of the chat. The chat above keeps showing the
 * reply, cards and the Confirm buttons (the scroll area is padded by this stage's height).
 * Top to bottom: a transient progress chip, status (+ connection), live captions (the user's
 * words, then the reply karaoke-style), mute · orb · end, "type instead".
 * Orb tap: interrupt while thinking / speaking, resume on a confirm card, unmute when muted.
 */
export function AgentVoiceDock({ state, session, onEnd, onTypeInstead, onShowCard, dataState }: AgentVoiceDockProps) {
  const { t } = useTranslation();
  const { phase, muted, notice } = state;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const debug = agentVoiceDebugEnabled();

  // Haptics on the turn's hand-offs: the user's turn ended, a card wants a tap, a fatal stop.
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === phase) return;
    if ((prev === 'hearing' || prev === 'transcribing') && phase === 'thinking') hapticSelection();
    else if (phase === 'confirm') hapticSelection();
    else if (phase === 'off' && notice && ERROR_NOTICES.has(notice)) hapticError();
  }, [phase, notice]);

  const level = useCallback(() => {
    const { input, output } = session.levels();
    const p = phaseRef.current;
    return p === 'speaking' ? output : p === 'listening' || p === 'hearing' ? input : 0;
  }, [session]);

  const showKaraoke = phase === 'speaking' && state.reply != null && state.reply.activeSeq != null;
  // The spoken filler ("Checking your games…") while it plays, before any reply line: the caption
  // line reads it out, so the chip (which carries it while thinking) steps aside instead of repeating it.
  const progressCaption = phase === 'speaking' && !notice && !showKaraoke && !state.agentCaption ? state.progress : null;
  const chipText = progressCaption ? null : state.progress;
  // The chip keeps its last text while it fades out.
  const lastProgressRef = useRef<string | null>(null);
  if (chipText) lastProgressRef.current = chipText;
  // The spoken confirm prompt of this reply (only sent when the reply itself said nothing).
  const confirmPrompt = phase === 'confirm' ? lastConfirmLine(state) : null;

  const busy = phase === 'starting' || phase === 'transcribing';
  const orbMode: AgentOrbMode = muted
    ? 'muted'
    : notice && ERROR_NOTICES.has(notice) && phase === 'listening'
      ? 'error'
      : phase === 'off' || phase === 'starting' || phase === 'transcribing'
        ? 'listening'
        : phase;
  const statusKey = muted ? 'muted' : phase === 'off' ? 'starting' : phase;
  const orbLabel = muted
    ? t('agent.voice.unmute')
    : phase === 'speaking' || phase === 'thinking'
      ? t('agent.voice.interrupt')
      : phase === 'confirm'
        ? t('agent.voice.keepTalking')
        : t('agent.voice.listeningLabel');

  const userCaption =
    phase === 'hearing' || phase === 'transcribing' || phase === 'thinking'
      ? (state.liveCaption?.text ?? state.userCaption)
      : null;

  let caption: ReactNode;
  if (phase === 'confirm') {
    caption = (
      <button
        type="button"
        onClick={onShowCard}
        className="mx-auto flex max-w-full items-center gap-2.5 rounded-2xl bg-amber-50 px-3.5 py-2 text-start ring-1 ring-amber-200 transition-colors hover:bg-amber-100 dark:bg-amber-950/40 dark:ring-amber-800/60 dark:hover:bg-amber-950/60"
      >
        <span className="agent-voice-callout-arrow flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <ArrowUp size={18} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-amber-900 dark:text-amber-100">{t('agent.voice.confirmCallout')}</span>
          <span
            key={confirmPrompt ?? state.confirmTitle ?? ''}
            className="agent-voice-caption-swap block truncate text-xs text-amber-700 dark:text-amber-300/80"
            dir="auto"
            title={confirmPrompt ?? undefined}
          >
            {confirmPrompt ?? state.confirmTitle ?? t('agent.voice.confirmCalloutHint')}
          </span>
        </span>
      </button>
    );
  } else if (notice) {
    caption = <p className="line-clamp-2 text-center text-sm text-amber-600 dark:text-amber-400">{t(`agent.voice.notice.${notice}`)}</p>;
  } else if (showKaraoke && state.reply) {
    caption = <AgentVoiceKaraoke reply={state.reply} session={session} />;
  } else if (phase === 'speaking' && state.agentCaption) {
    caption = (
      <p className="line-clamp-3 text-center text-[15px] font-medium leading-snug text-gray-900 dark:text-white" dir="auto">
        {state.agentCaption}
      </p>
    );
  } else if (progressCaption) {
    caption = (
      <p
        key={progressCaption}
        className="agent-voice-caption-swap flex min-w-0 max-w-full items-center justify-center gap-1.5 text-[15px] leading-snug text-gray-600 dark:text-gray-300"
        data-testid="agent-voice-progress-caption"
      >
        <Loader2 size={14} className="flex-shrink-0 text-primary-500 motion-safe:animate-spin" aria-hidden />
        <span className="truncate" dir="auto">
          {progressCaption}
        </span>
      </p>
    );
  } else if (userCaption) {
    caption = (
      <p className="line-clamp-3 text-center text-[15px] leading-snug text-gray-600 dark:text-gray-300" dir="auto">
        {userCaption}
      </p>
    );
  } else {
    caption = <p className="line-clamp-2 text-center text-sm text-gray-400 dark:text-gray-500">{t(`agent.voice.hint.${statusKey}`)}</p>;
  }

  const sideBtn =
    'agent-voice-stage-side flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full shadow-sm ring-1 transition-colors';

  return (
    <div
      className="agent-voice-stage"
      data-state={dataState}
      data-confirm={phase === 'confirm' ? '' : undefined}
      role="region"
      aria-label={t('agent.voice.title')}
    >
      <div className="agent-voice-stage-scrim" aria-hidden />
      <div className="agent-voice-stage-glow" aria-hidden />

      <div
        className="agent-voice-chip pointer-events-none absolute inset-x-0 -top-9 z-10 flex justify-center px-4"
        data-state={chipText ? 'open' : 'closed'}
        role="status"
        aria-hidden={chipText ? undefined : true}
        data-testid="agent-voice-progress-chip"
      >
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 dark:text-gray-200">
          <Loader2 size={12} className="flex-shrink-0 text-primary-500 motion-safe:animate-spin" aria-hidden />
          <span className="truncate" dir="auto">
            {chipText ?? lastProgressRef.current}
          </span>
        </span>
      </div>

      <div
        className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pt-1"
        style={{
          paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" aria-live="polite">
          <span className={phase === 'confirm' ? 'text-amber-600 dark:text-amber-400' : ''}>{t(`agent.voice.status.${statusKey}`)}</span>
          {state.reconnecting ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 normal-case tracking-normal text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse" aria-hidden />
              {t('agent.voice.connection.reconnecting')}
            </span>
          ) : state.transport === 'v1' ? (
            <span className="rounded-full bg-gray-200/70 px-2 py-0.5 font-medium normal-case tracking-normal text-gray-500 dark:bg-gray-700/70 dark:text-gray-400">
              {t('agent.voice.connection.fallback')}
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 flex min-h-[3.75rem] w-full max-w-md items-center justify-center" aria-live="polite" aria-label={t('agent.voice.captionsLabel')}>
          {caption}
        </div>

        <div className="mt-2 flex items-center justify-center gap-8">
          <button
            type="button"
            onClick={() => session.toggleMute()}
            aria-pressed={muted}
            aria-label={muted ? t('agent.voice.unmute') : t('agent.voice.mute')}
            className={`${sideBtn} ${
              muted
                ? 'bg-red-50 text-red-600 ring-red-200 dark:bg-red-950/50 dark:text-red-400 dark:ring-red-900/60'
                : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700'
            }`}
          >
            {muted ? <MicOff size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
          </button>

          <span className="agent-voice-stage-orb inline-flex">
            <AgentOrb size={ORB_SIZE} mode={orbMode} busy={busy} level={level} onTalk={() => session.tap()} label={orbLabel} />
          </span>

          <button
            type="button"
            onClick={onEnd}
            aria-label={t('agent.voice.end')}
            className={`${sideBtn} bg-white text-gray-700 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700`}
          >
            <X size={22} aria-hidden />
          </button>
        </div>

        <button
          type="button"
          onClick={onTypeInstead}
          className="mt-1.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <Keyboard size={16} aria-hidden />
          {t('agent.voice.typeInstead')}
        </button>

        {debug ? <AgentVoiceLatencyStrip timings={state.timings} transport={state.transport} /> : null}
      </div>
    </div>
  );
}
