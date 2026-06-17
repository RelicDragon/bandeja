import type { ReactNode } from 'react';
import { AnimatedMount } from '@/components/motion/AnimatedMount';

interface GameDetailsSectionProps {
  show?: boolean;
  children: ReactNode;
  className?: string;
}

export function GameDetailsSection({ show = true, children, className }: GameDetailsSectionProps) {
  return (
    <AnimatedMount layout show={show} className={className}>
      {children}
    </AnimatedMount>
  );
}
