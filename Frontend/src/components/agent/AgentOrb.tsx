import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, AudioLines, Loader2, MicOff } from 'lucide-react';
import { AgentGlyph } from './AgentGlyph';

/** Voice-mode looks (`styles/motion/agent-voice.css`). Without a mode the orb is the idle / home orb. */
export type AgentOrbMode = 'listening' | 'hearing' | 'thinking' | 'speaking' | 'confirm' | 'muted' | 'error';

interface AgentOrbProps {
  /** Diameter in px. */
  size?: number;
  /** Tap = start a voice conversation (must run inside the tap, iOS unlocks audio there). */
  onTalk?: () => void;
  label?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Voice mode: the state it shows (no "tap to talk" badge then). */
  mode?: AgentOrbMode;
  /** 0..1 loudness, polled every frame (mic while listening / hearing, reply while speaking). */
  level?: () => number;
}

/**
 * The assistant's orb: a spinning conic ring around the glyph with a breathing halo
 * (`styles/motion/agent-home.css`, still with reduced motion). With `onTalk` it is the
 * "tap to talk" button and wears a small waveform badge. In voice mode (`mode`) it shows who is
 * talking: breathing while listening, reacting to the voice while hearing, orbiting while
 * thinking, following the reply while speaking, orange while a card waits, dimmed when muted.
 * The loudness drives `--orb-level` straight on the DOM (no React render per frame).
 */
export function AgentOrb({ size = 72, onTalk, label, busy = false, disabled = false, mode, level }: AgentOrbProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const hasLevel = level != null;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!hasLevel || reduceMotion) {
      root.style.setProperty('--orb-level', '0');
      return;
    }
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const target = Math.max(0, Math.min(1, levelRef.current?.() ?? 0));
      // Fast attack, slower release: syllables pop, pauses settle.
      smooth += (target - smooth) * (target > smooth ? 0.45 : 0.15);
      root.style.setProperty('--orb-level', smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasLevel, reduceMotion]);

  const glyph = Math.round(size * 0.42);
  const icon = busy ? (
    <Loader2 size={glyph} className="animate-spin" />
  ) : mode === 'muted' ? (
    <MicOff size={Math.round(glyph * 0.85)} strokeWidth={2} />
  ) : mode === 'error' ? (
    <AlertCircle size={Math.round(glyph * 0.85)} strokeWidth={2} />
  ) : (
    <AgentGlyph size={glyph} strokeWidth={1.75} />
  );
  const body = (
    <>
      <span aria-hidden className="agent-orb-halo pointer-events-none absolute -inset-[22%] rounded-full blur-md" />
      <span aria-hidden className="agent-orb-ring absolute inset-0 rounded-full shadow-lg shadow-violet-500/30" />
      {mode === 'thinking' ? (
        <span aria-hidden className="agent-orb-orbit pointer-events-none absolute -inset-[9%] rounded-full">
          <span />
          <span />
          <span />
        </span>
      ) : null}
      <span
        aria-hidden
        className="agent-orb-core absolute inset-[3px] flex items-center justify-center rounded-full text-white shadow-[inset_0_-6px_14px_rgba(0,0,0,0.18)]"
      >
        {icon}
      </span>
      {onTalk && !mode ? (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -end-0.5 flex h-[38%] w-[38%] min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-white text-primary-600 shadow-md ring-2 ring-white dark:bg-gray-900 dark:text-primary-300 dark:ring-gray-900"
        >
          <AudioLines size={Math.max(12, Math.round(size * 0.2))} />
        </span>
      ) : null}
    </>
  );

  if (!onTalk) {
    return (
      <span
        ref={(el) => {
          rootRef.current = el;
        }}
        data-mode={mode}
        className="agent-orb relative inline-flex flex-shrink-0"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {body}
      </span>
    );
  }
  return (
    <motion.button
      ref={(el) => {
        rootRef.current = el;
      }}
      type="button"
      onClick={onTalk}
      disabled={disabled || busy}
      aria-label={label}
      title={label}
      data-mode={mode}
      whileHover={reduceMotion ? undefined : { scale: 1.05 }}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className="agent-orb relative inline-flex flex-shrink-0 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-primary-400/50 disabled:opacity-70"
      style={{ width: size, height: size }}
    >
      {body}
    </motion.button>
  );
}
