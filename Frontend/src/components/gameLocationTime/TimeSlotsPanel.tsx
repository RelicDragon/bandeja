import type { ReactNode } from 'react';

type TimeSlotsPanelProps = {
  dateSection: ReactNode;
  clubSection?: ReactNode;
  intentSection?: ReactNode;
  courtSection: ReactNode;
  timeSlotsChildren: ReactNode;
  reservationsStrip?: ReactNode;
  hintSection?: ReactNode;
  linkHintSection?: ReactNode;
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
  linkHintSection,
  overrideSection,
  authGateSection,
  summarySection,
  consequenceSection,
  needsBooktimeAuth,
  showTimeSlots = true,
}: TimeSlotsPanelProps) {
  return (
    <div className="space-y-4">
      {dateSection}
      {clubSection}
      {intentSection}
      {linkedReservationsSection}
      {courtSection}
      {authGateSection}
      {!needsBooktimeAuth ? reservationsStrip : null}
      {hintSection}
      {showTimeSlots ? timeSlotsChildren : null}
      {linkHintSection}
      {overrideSection}
      {summarySection}
      {consequenceSection}
    </div>
  );
}
