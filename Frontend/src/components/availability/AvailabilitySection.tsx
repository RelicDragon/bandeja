import { Card } from '../Card';
import { WeeklyAvailabilityPanel, type WeeklyAvailabilityPanelProps } from './WeeklyAvailabilityPanel';

export type AvailabilitySectionProps = WeeklyAvailabilityPanelProps;

export const AvailabilitySection = (props: WeeklyAvailabilityPanelProps) => (
  <Card className="mx-auto w-full min-w-0 max-w-2xl">
    <WeeklyAvailabilityPanel {...props} />
  </Card>
);
