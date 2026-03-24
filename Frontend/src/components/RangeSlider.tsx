import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  step?: number;
  compact?: boolean;
}

export const RangeSlider = ({
  min,
  max,
  value,
  onChange,
  step = 0.1,
  compact = false,
}: RangeSliderProps) => {
  const trackH = compact ? 4 : 6;
  const handleSize = compact ? 14 : 20;
  const handleMarginTop = compact ? -5 : -7;

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-4'}>
      <div
        className={`flex items-center justify-between gap-2 ${compact ? 'px-0' : 'gap-4 px-2'}`}
      >
        <div
          className={`inline-flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 ${
            compact ? 'px-2 py-0.5' : 'px-4 py-1.5'
          }`}
        >
          <span
            className={`font-semibold text-gray-700 dark:text-gray-300 ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {value[0].toFixed(1)}
          </span>
        </div>
        <div
          className={`inline-flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 ${
            compact ? 'px-2 py-0.5' : 'px-4 py-1.5'
          }`}
        >
          <span
            className={`font-semibold text-gray-700 dark:text-gray-300 ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {value[1].toFixed(1)}
          </span>
        </div>
      </div>

      <div className={compact ? 'px-0 py-0.5' : 'px-2 py-2'}>
        <Slider
          range
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(val) => {
            if (Array.isArray(val) && val.length === 2) {
              onChange([val[0], val[1]]);
            }
          }}
          styles={{
            track: {
              backgroundColor: 'transparent',
              height: trackH,
            },
            tracks: {
              backgroundColor: 'rgb(59 130 246)',
              height: trackH,
            },
            rail: {
              backgroundColor: 'rgb(229 231 235)',
              height: trackH,
            },
            handle: {
              backgroundColor: 'rgb(59 130 246)',
              border: compact ? '2px solid white' : '3px solid white',
              width: handleSize,
              height: handleSize,
              marginTop: handleMarginTop,
              opacity: 1,
              boxShadow: compact
                ? '0 1px 4px rgba(59, 130, 246, 0.35)'
                : '0 2px 8px rgba(59, 130, 246, 0.3)',
            },
          }}
        />
      </div>
    </div>
  );
};
