import type { ReactNode } from 'react';

interface AnimatedLoadingSwapProps {
  isLoading: boolean;
  loading: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AnimatedLoadingSwap({
  isLoading,
  loading,
  children,
  className,
}: AnimatedLoadingSwapProps) {
  return <div className={className}>{isLoading ? loading : children}</div>;
}
