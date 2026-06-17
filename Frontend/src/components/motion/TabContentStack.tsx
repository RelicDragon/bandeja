import { LayoutGroup } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface TabContentStackProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function TabContentStack({ children, className, id = 'tab-content-stack' }: TabContentStackProps) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <LayoutGroup id={id}>
      <div className={className}>{children}</div>
    </LayoutGroup>
  );
}
