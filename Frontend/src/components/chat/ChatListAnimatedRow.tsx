import { type ReactNode, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { ChatListRowEnterShell } from './ChatListRowEnterShell';

type ChatListAnimatedRowProps = {
  isNew: boolean;
  staggerIndex: number;
  children: ReactNode;
};

/** Locks enter animation at mount so parent re-renders cannot cancel it mid-flight. */
export function ChatListAnimatedRow({ isNew, staggerIndex, children }: ChatListAnimatedRowProps) {
  const reduceMotion = usePrefersReducedMotion();
  const shouldEnterRef = useRef(isNew);

  if (reduceMotion || !shouldEnterRef.current) {
    return <>{children}</>;
  }

  return (
    <ChatListRowEnterShell staggerIndex={staggerIndex}>
      {children}
    </ChatListRowEnterShell>
  );
}
