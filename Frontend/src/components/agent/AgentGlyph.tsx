import { useId } from 'react';

interface AgentGlyphProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/**
 * The assistant's mark: a padel ball with a spark. Line icon in `currentColor`
 * on a 24px grid, so it sits next to lucide icons (e.g. the My switch).
 */
export function AgentGlyph({ size = 24, className, strokeWidth = 2 }: AgentGlyphProps) {
  const maskId = `agent-glyph-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" />
          <circle cx="19" cy="5" r="5.25" fill="black" stroke="none" />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <circle cx="10.5" cy="13.5" r="8" />
        <path d="M4.6 8.2c2.9 2.6 3 7.7.2 10.4" />
        <path d="M16.6 9.4c-2.6 2.4-2.7 6.7-.3 9.3" />
      </g>
      <path
        d="M19 1.6c.35 1.9 1.25 2.85 3.15 3.2-1.9.35-2.8 1.3-3.15 3.2-.35-1.9-1.25-2.85-3.15-3.2 1.9-.35 2.8-1.3 3.15-3.2Z"
        fill="currentColor"
        strokeWidth={1}
      />
    </svg>
  );
}
