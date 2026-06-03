import type { SVGProps } from 'react';

type TableTennisBallIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

/** 40 mm ITTF-style ball — matte white, subtle seam (not tennis/padel yellow). */
export function TableTennisBallIcon({ size = 16, className, ...rest }: TableTennisBallIconProps) {
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
        <radialGradient id="tt-ball-fill" cx="35%" cy="30%" r="68%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f5f5f4" />
          <stop offset="100%" stopColor="#d6d3d1" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.25" fill="url(#tt-ball-fill)" stroke="#ffffff" strokeWidth="0.5" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="#000000" strokeOpacity="0.06" strokeWidth="0.45" />
      <path
        d="M5.2 12c2.4-3.8 5.2-5.6 6.8-5.6s4.4 1.8 6.8 5.6"
        fill="none"
        stroke="#000000"
        strokeOpacity="0.07"
        strokeWidth="0.5"
      />
    </svg>
  );
}
