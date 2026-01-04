import { useMemo } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

interface TimeRangeSliderProps {
  value: [string, string];
  onChange: (value: [string, string]) => void;
  hour12: boolean;
}

const MINUTES_IN_DAY = 1440;
const STEP_MINUTES = 30;

const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const timeStringToMinutes = (time: string): number => {
  if (!time) return 0;
  if (time === '24:00') return MINUTES_IN_DAY;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const formatTimeDisplay = (minutes: number, hour12: boolean): string => {
  if (minutes >= MINUTES_IN_DAY) {
    return hour12 ? '12:00am' : '24:00';
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hour12) {
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${String(mins).padStart(2, '0')}${period}`;
  } else {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
};

export const TimeRangeSlider = ({ value, onChange, hour12 }: TimeRangeSliderProps) => {
  const [startMinutes, endMinutes] = useMemo(() => {
    return [
      timeStringToMinutes(value[0] || '00:00'),
      timeStringToMinutes(value[1] || '24:00'),
    ];
  }, [value]);

  const handleChange = (sliderValue: number | number[]) => {
    if (Array.isArray(sliderValue) && sliderValue.length === 2) {
      const [start, end] = sliderValue;
      onChange([
        minutesToTimeString(start),
        minutesToTimeString(end),
      ]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 px-2">
        <div className="inline-flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg px-4 py-1.5">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {formatTimeDisplay(startMinutes, hour12)}
          </span>
        </div>
        <div className="inline-flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg px-4 py-1.5">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {formatTimeDisplay(endMinutes, hour12)}
          </span>
        </div>
      </div>

      <div className="px-2 py-2">
        <Slider
          range
          min={0}
          max={MINUTES_IN_DAY}
          step={STEP_MINUTES}
          value={[startMinutes, endMinutes]}
          onChange={handleChange}
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

