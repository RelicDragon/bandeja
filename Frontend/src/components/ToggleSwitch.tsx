interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

export const ToggleSwitch = ({ checked, onChange, disabled = false, id }: ToggleSwitchProps) => (
  <button
    type="button"
    id={id}
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) onChange(!checked);
    }}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    } ${checked ? 'bg-primary-500 dark:bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}
  >
    {/* The thumb travels on `margin-inline-start`, not a physical
        `translateX`, so under `dir="rtl"` it moves toward the track's leading
        edge the way the switch actually reads (CONTRACT §8.1). */}
    <span
      className="inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-[margin] duration-200 ease-out motion-reduce:transition-none"
      style={{ marginInlineStart: checked ? '1.5rem' : '0.25rem' }}
    />
  </button>
);

