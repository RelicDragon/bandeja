import { LucideIcon, Check } from 'lucide-react';
import { motion } from 'framer-motion';

interface FormatOptionCardProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  hint?: string;
  badge?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export const FormatOptionCard = ({
  icon: Icon,
  title,
  subtitle,
  hint,
  badge,
  selected,
  disabled,
  onClick,
}: FormatOptionCardProps) => {
  const hasSecondRow = !!(badge || subtitle || hint);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={`flex w-full flex-col items-stretch text-left rounded-xl border-2 p-4 transition-all duration-200 overflow-hidden ${
        selected
          ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-white dark:from-primary-500/10 dark:to-gray-900 shadow-lg shadow-primary-500/20'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary-300 dark:hover:border-primary-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center transition-colors ${
            selected
              ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          <Icon size={22} />
        </div>
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-white text-left truncate">
          {title}
        </h3>
        {selected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md"
          >
            <Check size={14} className="text-white" strokeWidth={3} />
          </motion.div>
        )}
      </div>
      {hasSecondRow && (
        <div className="mt-2.5 w-full min-w-0 space-y-1.5">
          {badge && (
            <span className="inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300">
              {badge}
            </span>
          )}
          {subtitle && <p className="text-xs text-gray-600 dark:text-gray-400">{subtitle}</p>}
          {hint && <p className="text-[11px] text-gray-500 dark:text-gray-500">{hint}</p>}
        </div>
      )}
    </motion.button>
  );
};
