import type { ReactNode } from 'react';

interface TabContentStackProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function TabContentStack({ children, className }: TabContentStackProps) {
  return <div className={className}>{children}</div>;
}
