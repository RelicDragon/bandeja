interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const ToggleSwitch = ({ checked, onChange, disabled = false }: ToggleSwitchProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) onChange(!checked);
    }}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    } ${
      checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

