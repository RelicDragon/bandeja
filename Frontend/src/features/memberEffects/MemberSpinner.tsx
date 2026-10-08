import type { CSSProperties } from 'react';
import type { MemberThemeId } from '@/utils/mainTheme';
import { spinnerFor, type SpinnerKind } from './memberEffectsConfig';
import { GEAR_PATH, SNOWFLAKE_PATH } from './MemberParticleShape';
import './memberEffects.css';

type MemberSpinnerProps = {
  theme: MemberThemeId;
  /** Size classes of the spinner it replaces (e.g. `w-5 h-5`), so nothing reflows. */
  className?: string;
  /**
   * Omit while loading (the glyph turns). While a pull-to-refresh is in progress pass the
   * pull progress 0…1 — a number, or a CSS expression such as `var(--chat-pull-progress, 0)` —
   * and the glyph poses to it instead.
   */
  progress?: number | string;
};

const BUBBLES = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
  return { cx: 12 + Math.cos(a) * 8, cy: 12 + Math.sin(a) * 8, r: 2.5 - i * 0.2, opacity: 1 - i * 0.1 };
});

function Glyph({ kind }: { kind: SpinnerKind }) {
  switch (kind) {
    case 'goldRing':
      return (
        <>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={2.25} opacity={0.2} />
          <g className="mfx-rot">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeDasharray="16 41"
              transform="rotate(-90 12 12)"
            />
            <path className="mfx-alt-fill" d="M20.8 10.6l.8 2.5 2.4.8-2.4.8-.8 2.5-.8-2.5-2.4-.8 2.4-.8z" />
          </g>
        </>
      );
    case 'swallow':
      return (
        <>
          <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="1.5 2.5" opacity={0.35} />
          <g className="mfx-rot">
            <g transform="translate(12 3.8) rotate(90) scale(0.78) translate(-12 -5.4)">
              <path
                fill="currentColor"
                d="M5.5 4.8C8 2.3 10.5 2.2 12 4.4c1.5-2.2 4-2.1 6.5.4-2.3-.8-4.6-.1-5.8 1.9l.9 3.3L12 8.6l-1.6 1.4.9-3.3C10.1 4.7 7.8 4 5.5 4.8z"
              />
            </g>
          </g>
        </>
      );
    case 'sunRays':
      return (
        <>
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <g className="mfx-rot" stroke="currentColor" strokeLinecap="round" strokeWidth={1.8}>
            <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" />
            <path d="M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6" opacity={0.6} />
          </g>
        </>
      );
    case 'alpineSunrise':
      return (
        <>
          <circle className="mfx-sun mfx-alt-fill" cx="12" cy="7.6" r="4" />
          <path fill="currentColor" d="M1.5 20.5 8.3 9.2l3.4 5 3-3.9 7.8 10.2z" />
          <path fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" d="M1.5 21.6h21" opacity={0.5} />
        </>
      );
    case 'snowflake':
      return (
        <g className="mfx-rot" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d={SNOWFLAKE_PATH} />
        </g>
      );
    case 'bubbleRing':
      return (
        <g className="mfx-rot" fill="currentColor">
          {BUBBLES.map((b, i) => (
            <circle key={i} cx={b.cx} cy={b.cy} r={b.r} opacity={b.opacity} />
          ))}
        </g>
      );
    case 'woodRing':
      return (
        <g className="mfx-rot" fill="none" stroke="currentColor" strokeLinecap="round">
          <circle cx="12" cy="12" r="9.2" strokeWidth={2} strokeDasharray="49 9" />
          <circle cx="12" cy="12" r="6" strokeWidth={1.3} strokeDasharray="30 7.7" opacity={0.7} />
          <circle cx="12" cy="12" r="2.8" strokeWidth={1.2} opacity={0.55} />
          <path d="M13.5 10.5 18.6 5.6" strokeWidth={1} opacity={0.5} />
        </g>
      );
    case 'gear':
      return (
        <g className="mfx-rot mfx-rot--slow">
          <path fill="currentColor" fillRule="evenodd" d={GEAR_PATH} />
        </g>
      );
    case 'neonDash':
      return (
        <>
          <g className="mfx-rot">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray="10 4 2.5 4" />
          </g>
          <g className="mfx-rot mfx-rot--reverse">
            <circle className="mfx-alt-stroke" cx="12" cy="12" r="5.2" fill="none" strokeWidth={1.6} strokeDasharray="5 3.2" />
          </g>
        </>
      );
  }
}

/**
 * Member-theme loading indicator: a small inline SVG painted with the theme's
 * page accent (`--member-primary-default`), same box as the spinner it replaces.
 */
export function MemberSpinner({ theme, className = 'w-5 h-5', progress }: MemberSpinnerProps) {
  const kind = spinnerFor(theme);
  if (!kind) return null;
  const pulling = progress !== undefined;
  return (
    <svg
      viewBox="0 0 24 24"
      className={`mfx-spinner ${className}`}
      data-testid="member-spinner"
      data-spinner={kind}
      data-state={pulling ? 'pull' : 'spin'}
      style={pulling ? ({ '--mfx-p': String(progress) } as CSSProperties) : undefined}
      aria-hidden
    >
      <Glyph kind={kind} />
    </svg>
  );
}
