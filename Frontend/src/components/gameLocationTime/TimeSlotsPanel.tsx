import type { ReactNode } from 'react';

type TimeSlotsPanelProps = {
  dateSection: ReactNode;
  clubSection?: ReactNode;
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
  clubSection,
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
      {clubSection}
      {courtSection}
      {authGateSection}
      {!needsBooktimeAuth ? reservationsStrip : null}
      {hintSection}
      {timeSlotsChildren}
      {linkHintSection}
      {overrideSection}
    </div>
  );
}
