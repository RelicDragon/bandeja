import { motion, useReducedMotion } from 'framer-motion';
import { AudioLines, Loader2 } from 'lucide-react';
import { AgentGlyph } from './AgentGlyph';

interface AgentOrbProps {
  /** Diameter in px. */
  size?: number;
  /** Tap = start a voice conversation (must run inside the tap, iOS unlocks audio there). */
  onTalk?: () => void;
  label?: string;
  busy?: boolean;
  disabled?: boolean;
}

/**
 * The assistant's orb: a spinning conic ring around the glyph with a breathing halo
 * (`styles/motion/agent-home.css`, still with reduced motion). With `onTalk` it is the
 * "tap to talk" button and wears a small waveform badge.
 */
export function AgentOrb({ size = 72, onTalk, label, busy = false, disabled = false }: AgentOrbProps) {
  const reduceMotion = useReducedMotion();
  const glyph = Math.round(size * 0.42);
  const body = (
    <>
      <span aria-hidden className="agent-orb-halo pointer-events-none absolute -inset-[22%] rounded-full blur-md" />
      <span aria-hidden className="agent-orb-ring absolute inset-0 rounded-full shadow-lg shadow-violet-500/30" />
      <span
        aria-hidden
        className="agent-orb-core absolute inset-[3px] flex items-center justify-center rounded-full text-white shadow-[inset_0_-6px_14px_rgba(0,0,0,0.18)]"
      >
        {busy ? <Loader2 size={glyph} className="animate-spin" /> : <AgentGlyph size={glyph} strokeWidth={1.75} />}
      </span>
      {onTalk ? (
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
      <span className="relative inline-flex flex-shrink-0" style={{ width: size, height: size }} aria-hidden>
        {body}
      </span>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={onTalk}
      disabled={disabled || busy}
      aria-label={label}
      title={label}
      whileHover={reduceMotion ? undefined : { scale: 1.05 }}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className="relative inline-flex flex-shrink-0 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-primary-400/50 disabled:opacity-70"
      style={{ width: size, height: size }}
    >
      {body}
    </motion.button>
  );
}
