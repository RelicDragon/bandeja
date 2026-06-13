import type { ReactNode } from 'react';

type TimeSlotsPanelProps = {
  courtSection: ReactNode;
  timeSlotsChildren: ReactNode;
  hintSection?: ReactNode;
  authGateSection?: ReactNode;
  needsBooktimeAuth?: boolean;
};

export function TimeSlotsPanel({
  courtSection,
  timeSlotsChildren,
  hintSection,
  authGateSection,
  needsBooktimeAuth,
}: TimeSlotsPanelProps) {
  return (
    <div className="space-y-4">
      {courtSection}
      {needsBooktimeAuth ? authGateSection : null}
      {!needsBooktimeAuth ? (
        <>
          {hintSection}
          {timeSlotsChildren}
        </>
      ) : null}
    </div>
  );
}
