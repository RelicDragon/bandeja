import type { ReactNode } from 'react';

type TimeSlotsPanelProps = {
  dateSection: ReactNode;
  clubSection?: ReactNode;
  intentSection?: ReactNode;
  courtSection: ReactNode;
  timeSlotsChildren: ReactNode;
  reservationsStrip?: ReactNode;
  hintSection?: ReactNode;
  overrideSection?: ReactNode;
  authGateSection?: ReactNode;
  summarySection?: ReactNode;
  consequenceSection?: ReactNode;
  linkedReservationsSection?: ReactNode;
  needsBooktimeAuth?: boolean;
  showTimeSlots?: boolean;
};

export function TimeSlotsPanel({
  dateSection,
  clubSection,
  intentSection,
  linkedReservationsSection,
  courtSection,
  timeSlotsChildren,
  reservationsStrip,
  hintSection,
  overrideSection,
  authGateSection,
  summarySection,
  consequenceSection,
  needsBooktimeAuth,
  showTimeSlots = true,
}: TimeSlotsPanelProps) {
  return (
    <div className="space-y-4">
      {clubSection}
      {intentSection}
      {linkedReservationsSection}
      {dateSection}
      {courtSection}
      {authGateSection}
      {!needsBooktimeAuth ? reservationsStrip : null}
      {hintSection}
      {showTimeSlots ? timeSlotsChildren : null}
      {overrideSection}
      {summarySection}
      {consequenceSection}
    </div>
  );
}
