import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { heroGlass } from '@/components/userTeam/heroGlass';

interface TeamAvatarCutDialProps {
  children: ReactNode;
  enabled: boolean;
  angleDeg: number;
  onAngleChange: (deg: number) => void;
  onCommit: (deg: number) => void;
  disabled?: boolean;
  /** Rendered in the same panel, above the angle control (team colour). */
  colorPicker?: ReactNode;
  /** Rendered below the angle control (e.g. upload button) */
  footer?: ReactNode;
}

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

const COMMIT_DELAY_MS = 400;

const CONTROLS_WIDTH = 'min(12.5rem, calc(100vw - 2rem))';

/**
 * Team picture plus, for a photo-less pair, the "Split" control that rotates
 * the seam between the two faces. A labelled card with a live degree readout
 * (a bare track under the picture was too easy to miss) around a native range
 * input, so touch, keyboard and screen readers all work. Drags preview through
 * `onAngleChange`; release (pointer or key) commits once through `onCommit`.
 */
export function TeamAvatarCutDial({
  children,
  enabled,
  angleDeg,
  onAngleChange,
  onCommit,
  disabled,
  colorPicker,
  footer,
}: TeamAvatarCutDialProps) {
  const { t } = useTranslation();
  const rounded = Math.round(Number.isFinite(angleDeg) ? angleDeg : 0);
  // One save per gesture: key repeats and quick re-drags collapse into a single
  // request, so out-of-order responses cannot leave an older angle saved.
  const commitTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    },
    [],
  );
  const commit = (value: string) => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      onCommit(Number(value));
    }, COMMIT_DELAY_MS);
  };

  return (
    <div className="relative inline-flex flex-col items-center gap-3 p-3">
      <div className="relative h-[7.5rem] w-[7.5rem] shrink-0 sm:h-32 sm:w-32">{children}</div>
      {enabled || colorPicker ? (
        <div
          className={`rounded-2xl px-3.5 pt-2.5 ${enabled ? 'pb-2' : 'pb-3'} ${heroGlass} ${disabled ? 'opacity-50' : ''}`}
          style={{ width: CONTROLS_WIDTH }}
          data-testid="team-avatar-cut-dial"
        >
          {colorPicker}
          {colorPicker && enabled ? (
            <div className="-mx-3.5 my-2.5 border-t border-black/[0.06] dark:border-white/[0.08]" />
          ) : null}
          {enabled ? (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-100">
                  <svg viewBox="0 0 16 16" className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-hidden>
                    <rect
                      x="1.5"
                      y="1.5"
                      width="13"
                      height="13"
                      rx="3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    {/* The seam, at the same clockwise-from-horizontal angle `TeamAvatar` draws. */}
                    <line
                      x1="2.5"
                      y1="8"
                      x2="13.5"
                      y2="8"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      transform={`rotate(${rounded} 8 8)`}
                    />
                  </svg>
                  {t('teams.cutAngleLabel')}
                </span>
                <span className="font-semibold tabular-nums text-primary-600 dark:text-primary-300" aria-hidden>
                  {rounded}°
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={rounded}
                disabled={disabled}
                aria-label={t('teams.cutAngleDial')}
                aria-valuetext={`${rounded}°`}
                onChange={(e) => onAngleChange(Number(e.target.value))}
                onPointerUp={(e) => commit(e.currentTarget.value)}
                onKeyUp={(e) => {
                  if (SLIDER_KEYS.has(e.key)) commit(e.currentTarget.value);
                }}
                className="mt-1 h-7 w-full cursor-pointer touch-pan-y accent-primary-600 disabled:cursor-not-allowed dark:accent-primary-400"
              />
            </>
          ) : null}
        </div>
      ) : null}
      {footer ? <div className="mx-auto max-w-[calc(100vw-2rem)] shrink-0">{footer}</div> : null}
    </div>
  );
}
