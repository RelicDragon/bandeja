import type { SVGProps } from 'react';

type SquashBallIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

/** Pro squash ball — matte black with double yellow dot (from `/sports/squash.png` ball). */
export function SquashBallIcon({ size = 16, className, ...rest }: SquashBallIconProps) {
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
      <circle cx="12" cy="12" r="10" fill="#3a3a3a" stroke="#1f1f1f" strokeWidth="0.6" />
      <ellipse cx="14.5" cy="9.5" rx="3.2" ry="2.4" fill="#ffffff" opacity="0.14" />
      <circle cx="9.2" cy="10.2" r="1.65" fill="#fde047" stroke="#ca8a04" strokeWidth="0.35" />
      <circle cx="12.3" cy="10.2" r="1.65" fill="#fde047" stroke="#ca8a04" strokeWidth="0.35" />
    </svg>
  );
}
