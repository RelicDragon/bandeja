import type { SVGProps } from 'react';

type PickleballBallIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

/** Pickleball pictogram — solid shell, white perforations (stock icon #1). */
export function PickleballBallIcon({ size = 16, className, ...rest }: PickleballBallIconProps) {
  const holes: [number, number][] = [
    [9.5, 9.5],
    [14.5, 9.5],
    [9.5, 14.5],
    [14.5, 14.5],
  ];

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
      <circle cx="12" cy="12" r="10.25" fill="#111827" />
      {holes.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.45" fill="#ffffff" />
      ))}
    </svg>
  );
}
