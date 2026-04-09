import { useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface TeamAvatarCutDialProps {
  children: ReactNode;
  enabled: boolean;
  angleDeg: number;
  onAngleChange: (deg: number) => void;
  onCommit: (deg: number) => void;
  disabled?: boolean;
  /** Rendered below the angle track (e.g. upload button) */
  footer?: ReactNode;
}

export function TeamAvatarCutDial({
  children,
  enabled,
  angleDeg,
  onAngleChange,
  onCommit,
  disabled,
  footer,
}: TeamAvatarCutDialProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const controlsW = 'min(18rem, calc(100vw - 2rem))';
  const dragging = useRef(false);

  const pointerXToAngle = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return angleDeg;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return angleDeg;
    let t = (clientX - r.left) / r.width;
    t = Math.max(0, Math.min(1, t));
    return t * 360;
  }, [angleDeg]);

  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (!enabled || disabled) return;
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onAngleChange(pointerXToAngle(e.clientX));
  };

  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !enabled || disabled) return;
    e.preventDefault();
    onAngleChange(pointerXToAngle(e.clientX));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onCommit(pointerXToAngle(e.clientX));
  };

  if (!enabled) {
    return (
      <div className="relative inline-flex flex-col items-center gap-2.5 p-3">
        <div className="relative h-[7.5rem] w-[7.5rem] shrink-0 sm:h-32 sm:w-32">{children}</div>
        {footer ? (
          <div className="mx-auto shrink-0" style={{ width: controlsW }}>
            {footer}
          </div>
        ) : null}
      </div>
    );
  }

  const pct = (angleDeg / 360) * 100;

  return (
    <div className="relative inline-flex flex-col items-center gap-2.5 p-3">
      <div className="relative h-[7.5rem] w-[7.5rem] shrink-0 sm:h-32 sm:w-32">{children}</div>
      <div className="relative h-2 shrink-0" style={{ width: controlsW }}>
        <div
          ref={trackRef}
          className={`absolute inset-0 touch-none ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label={t('teams.cutAngleDial')}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(angleDeg)}
          tabIndex={disabled ? -1 : 0}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-600">
            <div
              className="absolute left-0 top-0 h-full rounded-l-full bg-primary-500 dark:bg-primary-400"
              style={{
                width: `${Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%`,
              }}
            />
          </div>
          <div
            className="pointer-events-none absolute top-1/2 z-[1] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary-600 shadow-md dark:border-zinc-900 dark:bg-primary-400"
            style={{ left: `${Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%` }}
          />
        </div>
      </div>
      {footer ? (
        <div className="mx-auto shrink-0" style={{ width: controlsW }}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
