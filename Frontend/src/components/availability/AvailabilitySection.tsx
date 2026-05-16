import { Card } from '../Card';
import { WeeklyAvailabilityPanel, type WeeklyAvailabilityPanelProps } from './WeeklyAvailabilityPanel';

export type AvailabilitySectionProps = WeeklyAvailabilityPanelProps;

export const AvailabilitySection = (props: WeeklyAvailabilityPanelProps) => (
  <Card className="">
    <WeeklyAvailabilityPanel {...props} />
  </Card>
);
