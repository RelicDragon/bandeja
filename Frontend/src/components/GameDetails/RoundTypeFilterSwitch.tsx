import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import type { RoundTypeFilterValue } from '@/utils/roundTypeFilterStorage';

interface RoundTypeFilterSwitchProps {
  value: RoundTypeFilterValue;
  regularLabel: string;
  playoffLabel: string;
  onSelect: (value: RoundTypeFilterValue) => void;
  layoutId?: string;
}

export const RoundTypeFilterSwitch = ({
  value,
  regularLabel,
  playoffLabel,
  onSelect,
  layoutId = 'round-type-filter',
}: RoundTypeFilterSwitchProps) => (
  <div className="flex justify-center w-full">
    <SegmentedSwitch
      tabs={[
        { id: 'REGULAR', label: regularLabel },
        { id: 'PLAYOFF', label: playoffLabel },
      ]}
      activeId={value}
      onChange={(id) => onSelect(id as RoundTypeFilterValue)}
      titleInActiveOnly={false}
      layoutId={layoutId}
      className="w-fit"
    />
  </div>
);
