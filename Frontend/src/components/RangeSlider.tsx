import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  step?: number;
}

export const RangeSlider = ({ min, max, value, onChange, step = 0.1 }: RangeSliderProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 px-2">
        <div className="inline-flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-1.5">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {value[0].toFixed(1)}
          </span>
        </div>
        <div className="inline-flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-1.5">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {value[1].toFixed(1)}
          </span>
        </div>
      </div>

      <div className="px-2 py-2">
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
              height: 6,
            },
            tracks: {
              backgroundColor: 'rgb(59 130 246)',
              height: 6,
            },
            rail: {
              backgroundColor: 'rgb(229 231 235)',
              height: 6,
            },
            handle: {
              backgroundColor: 'rgb(59 130 246)',
              border: '3px solid white',
              width: 20,
              height: 20,
              marginTop: -7,
              opacity: 1,
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            },
          }}
        />
      </div>
    </div>
  );
};

