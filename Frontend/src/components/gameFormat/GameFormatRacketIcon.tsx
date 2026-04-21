import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & {
  size?: number;
};

export function GameFormatRacketIcon({ size = 15, className, ...rest }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      <g transform="rotate(-24 12 12)">
        <path d="M12 2.18C16.8 2.18 20.2 6.05 19.5 10.25 19 13.5 16.45 16.05 13.35 16.45L14.55 21.4Q12 22.55 9.45 21.4L10.65 16.45C7.55 16.05 5 13.5 4.5 10.25 3.8 6.05 7.2 2.18 12 2.18z" />
        <circle cx="12" cy="1.72" r="0.5" strokeWidth={1.1} />
        <g strokeWidth={1.02}>
          <circle cx="9.1" cy="6.42" r="0.76" />
          <circle cx="12" cy="6.42" r="0.76" />
          <circle cx="14.9" cy="6.42" r="0.76" />
          <circle cx="8.58" cy="9.52" r="0.76" />
          <circle cx="12" cy="9.52" r="0.76" />
          <circle cx="15.42" cy="9.52" r="0.76" />
          <circle cx="9.1" cy="12.62" r="0.76" />
          <circle cx="12" cy="12.62" r="0.76" />
          <circle cx="14.9" cy="12.62" r="0.76" />
        </g>
      </g>
    </svg>
  );
}
