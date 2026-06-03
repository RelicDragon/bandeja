import type { ReactNode } from 'react';
import { LiveCourtViewport } from './LiveCourtViewport';

type LiveSetupCourtFrameProps = {
  aspect: readonly [number, number];
  children: ReactNode;
};

/** Fitted schematic slot for serve setup (same contain logic as live match). */
export function LiveSetupCourtFrame({ aspect, children }: LiveSetupCourtFrameProps) {
  return (
    <div className="flex min-h-[12rem] w-full max-w-md flex-col">
      <LiveCourtViewport aspect={aspect} className="min-h-0 flex-1">
        {children}
      </LiveCourtViewport>
    </div>
  );
}
