import type { ReactNode } from 'react';

type TimeSlotsPanelProps = {
  dateSection: ReactNode;
  courtSection: ReactNode;
  timeSlotsChildren: ReactNode;
  reservationsStrip?: ReactNode;
  hintSection?: ReactNode;
  linkHintSection?: ReactNode;
  overrideSection?: ReactNode;
  authGateSection?: ReactNode;
  needsBooktimeAuth?: boolean;
};

export function TimeSlotsPanel({
  dateSection,
  courtSection,
  timeSlotsChildren,
  reservationsStrip,
  hintSection,
  linkHintSection,
  overrideSection,
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
          {reservationsStrip}
          {hintSection}
          {timeSlotsChildren}
          {linkHintSection}
          {overrideSection}
        </>
      ) : null}
    </div>
  );
}
