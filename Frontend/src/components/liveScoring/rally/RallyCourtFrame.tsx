import type { ReactNode } from 'react';

type RallyCourtFrameProps = {
  viewBox: string;
  surfaceClassName: string;
  className?: string;
  children: ReactNode;
};

export function RallyCourtFrame({ viewBox, surfaceClassName, children, className }: RallyCourtFrameProps) {
  return (
    <svg
      viewBox={viewBox}
      className={`mx-auto block h-auto max-h-40 w-full max-w-sm ${surfaceClassName} ${className ?? ''}`}
      role="img"
      aria-hidden
    >
      {children}
    </svg>
  );
}
