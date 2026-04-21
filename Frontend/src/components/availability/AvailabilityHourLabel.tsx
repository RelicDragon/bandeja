interface AvailabilityHourLabelProps {
  label: string;
  isMajor: boolean;
  onClick: () => void;
}

export const AvailabilityHourLabel = ({ label, isMajor, onClick }: AvailabilityHourLabelProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'text-[10px] tabular-nums text-right pr-1.5 leading-5 md:leading-6 transition-colors select-none',
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
