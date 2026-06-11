import { useState } from 'react';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface WeekRangeNavigatorProps {
  start: Date;
  end: Date;
  onNavigate: (direction: 'left' | 'right') => void;
}

const navButtonClass =
  'flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200/60 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700/60 dark:hover:bg-gray-700 dark:hover:text-white';

export const WeekRangeNavigator = ({ start, end, onNavigate }: WeekRangeNavigatorProps) => {
  const [direction, setDirection] = useState(0);
  const label = `${format(start, 'dd.MM.yyyy')} - ${format(end, 'dd.MM.yyyy')}`;

  const handleNavigate = (dir: 'left' | 'right') => {
    setDirection(dir === 'left' ? -1 : 1);
    onNavigate(dir);
  };

  return (
    <div className="mb-4 flex items-center justify-center gap-3">
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={() => handleNavigate('left')}
        className={navButtonClass}
      >
        <ChevronLeft size={20} />
      </motion.button>
      <div className="relative w-48 overflow-hidden text-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            initial={{ x: direction * 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -28, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="block text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={() => handleNavigate('right')}
        className={navButtonClass}
      >
        <ChevronRight size={20} />
      </motion.button>
    </div>
  );
};
