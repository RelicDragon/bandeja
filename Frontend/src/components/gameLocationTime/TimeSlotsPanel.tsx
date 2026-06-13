import type { ReactNode } from 'react';

type TimeSlotsPanelProps = {
  dateSection: ReactNode;
  courtSection: ReactNode;
  timeSlotsChildren: ReactNode;
  hintSection?: ReactNode;
  authGateSection?: ReactNode;
  needsBooktimeAuth?: boolean;
};

export function TimeSlotsPanel({
  dateSection,
  courtSection,
  timeSlotsChildren,
  hintSection,
  authGateSection,
  needsBooktimeAuth,
}: TimeSlotsPanelProps) {
  return (
    <div className="space-y-4">
      {dateSection}
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
