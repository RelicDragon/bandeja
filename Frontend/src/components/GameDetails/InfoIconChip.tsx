import type { ReactNode } from 'react';

export const InfoIconChip = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400 ${className}`}
  >
    {children}
  </span>
);
