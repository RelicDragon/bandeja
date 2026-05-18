interface AvailabilityHourLabelProps {
  label: string;
  isMajor: boolean;
  onClick: () => void;
  className?: string;
}

export const AvailabilityHourLabel = ({ label, isMajor, onClick, className = '' }: AvailabilityHourLabelProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'text-[9px] tabular-nums text-right pr-0.5 leading-5 md:leading-6 transition-colors select-none',
        className,
        isMajor
          ? 'text-gray-600 dark:text-gray-300 font-medium'
          : 'text-gray-400 dark:text-gray-500',
        'hover:text-primary-600 dark:hover:text-primary-400',
      ].join(' ')}
    >
      {label}
    </button>
  );
};
