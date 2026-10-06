/**
 * The one reservation chip, for a whole game (summary) or a single court slot.
 *
 *  planned  — amber dashed outline: nothing held yet, nothing wrong either;
 *  partial  — amber, with a tiny ring showing how many courts are held;
 *  reserved — green check;
 *  gap      — amber clock: held, but not for the whole game;
 *  unknown  — amber clock: held, time unknown;
 *  gameOnly — neutral gray: the organizer handles the court, nothing to do.
 *
 * A linked provider reservation carries a small tick.
 *
 * A state change never depends on animation events for its end state: the
 * new label is always the in-flow, fully opaque content. The outgoing label is
 * a purely decorative, aria-hidden overlay (old tone) that fades out in CSS and
 * is removed on `animationend` *or* by a timeout fallback — animation events
 * don't fire in a hidden/backgrounded WebView or under reduced motion. With
 * reduced motion there is no overlay at all.
 */
import { useEffect, useState } from 'react';
import { BadgeCheck, CalendarClock, CalendarOff, Check, Clock } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { ReservationPillTone } from './reservationPillTone';
import './courtReservations.css';

/** The outgoing overlay is gone after this long even if no animation event fires. */
export const PILL_OVERLAY_FALLBACK_MS = 220;

export type ReservationPillProps = {
  tone: ReservationPillTone;
  label: string;
  size?: 'compact' | 'full';
  /** 0–1, drawn as a ring for `partial`. */
  progress?: number;
  /** A provider reservation is linked (shows the tick). */
  linked?: boolean;
  className?: string;
};

const TONE_CLASS: Record<ReservationPillTone, string> = {
  planned:
    'border border-dashed border-amber-400 bg-transparent text-amber-800 dark:border-amber-500/70 dark:text-amber-300',
  partial:
    'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200',
  reserved:
    'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200',
  gap: 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200',
  unknown:
    'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200',
  gameOnly:
    'border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200',
};

function ProgressRing({ progress, size }: { progress: number; size: number }) {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-amber-200 dark:stroke-amber-800" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        className="stroke-amber-500 transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none dark:stroke-amber-400"
      />
    </svg>
  );
}

function ToneIcon({ tone, progress, iconSize }: { tone: ReservationPillTone; progress?: number; iconSize: number }) {
  switch (tone) {
    case 'planned':
      return <CalendarClock size={iconSize} aria-hidden className="shrink-0" />;
    case 'partial':
      return <ProgressRing progress={progress ?? 0} size={iconSize} />;
    case 'reserved':
      return <Check size={iconSize} strokeWidth={2.5} aria-hidden className="shrink-0" />;
    case 'gap':
    case 'unknown':
      return <Clock size={iconSize} aria-hidden className="shrink-0" />;
    case 'gameOnly':
      return <CalendarOff size={iconSize} aria-hidden className="shrink-0" />;
  }
}

type PillFace = { tone: ReservationPillTone; label: string; progress?: number; linked: boolean };

function faceKey(face: PillFace): string {
  return `${face.tone}:${face.label}`;
}

function PillContent({ face, iconSize }: { face: PillFace; iconSize: number }) {
  return (
    <>
      <ToneIcon tone={face.tone} progress={face.progress} iconSize={iconSize} />
      <span className="truncate">{face.label}</span>
      {face.linked ? <BadgeCheck size={iconSize} aria-hidden className="shrink-0 opacity-80" data-provider-tick="" /> : null}
    </>
  );
}

export function ReservationPill({ tone, label, size = 'full', progress, linked = false, className }: ReservationPillProps) {
  const reduceMotion = usePrefersReducedMotion();
  const compact = size === 'compact';
  const iconSize = compact ? 12 : 14;
  const sizeClass = compact ? 'h-6 gap-1 px-2 text-[11px]' : 'h-7 gap-1.5 px-2.5 text-xs';
  const face: PillFace = { tone, label, progress, linked };
  const key = faceKey(face);

  // Previous face + the outgoing overlay, derived during render (no effect lag).
  const [shown, setShown] = useState<PillFace>(face);
  const [outgoing, setOutgoing] = useState<PillFace | null>(null);
  if (faceKey(shown) !== key) {
    setShown(face);
    setOutgoing(reduceMotion ? null : shown);
  }

  const outgoingKey = outgoing ? faceKey(outgoing) : null;
  useEffect(() => {
    if (!outgoingKey) return;
    const id = window.setTimeout(() => setOutgoing(null), PILL_OVERLAY_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [outgoingKey]);

  return (
    <span
      data-reservation-tone={tone}
      className={`relative inline-flex max-w-full items-center whitespace-nowrap rounded-full font-medium transition-colors duration-200 motion-reduce:transition-none ${sizeClass} ${TONE_CLASS[tone]} ${className ?? ''}`}
    >
      <span className="inline-flex min-w-0 items-center gap-[inherit]">
        <PillContent face={face} iconSize={iconSize} />
      </span>
      {outgoing ? (
        <span
          key={outgoingKey}
          aria-hidden
          data-pill-outgoing=""
          onAnimationEnd={() => setOutgoing(null)}
          className="cr-fade-out pointer-events-none absolute -inset-px overflow-hidden rounded-full bg-white dark:bg-gray-800"
        >
          <span className={`flex h-full w-full items-center rounded-full ${sizeClass} ${TONE_CLASS[outgoing.tone]}`}>
            <PillContent face={outgoing} iconSize={iconSize} />
          </span>
        </span>
      ) : null}
    </span>
  );
}
