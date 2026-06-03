import type { SVGProps } from 'react';

type PadelBallIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

/** FIP-style high-viz padel ball (fluo yellow–lime, not warm tennis amber). */
export function PadelBallIcon({ size = 16, className, ...rest }: PadelBallIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      {...rest}
    >
      <defs>
        <radialGradient id="padel-ball-fill" cx="32%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#f4ff9a" />
          <stop offset="45%" stopColor="#e8fc38" />
          <stop offset="100%" stopColor="#b8cf0a" />
        </radialGradient>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="10.25"
        fill="url(#padel-ball-fill)"
        stroke="#3f6212"
        strokeOpacity="0.35"
        strokeWidth="0.55"
      />
      <path
        d="M6.2 8.8c2.1 4.8 4.8 7.2 5.8 7.2s3.7-2.4 5.8-7.2"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.42"
        strokeWidth="0.85"
        strokeLinecap="round"
      />
      <path
        d="M17.8 8.8c-2.1 4.8-4.8 7.2-5.8 7.2s-3.7-2.4-5.8-7.2"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.32"
        strokeWidth="0.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
