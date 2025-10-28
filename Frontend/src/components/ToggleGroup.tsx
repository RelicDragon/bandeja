import React from 'react';

interface ToggleOption {
  value: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export interface ToggleGroupProps {
  label: string;
  options: ToggleOption[];
  disabled?: boolean;
}

export const ToggleGroup: React.FC<ToggleGroupProps> = ({ label, options, disabled = false }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        {label}
      </label>
      <div className="flex gap-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => !disabled && option.onChange(!option.checked)}
            disabled={disabled}
            className={`
              flex-1 px-4 py-3 rounded-xl font-medium text-sm
              transition-all duration-200 ease-in-out
              border-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
              dark:focus:ring-offset-gray-900
              ${
                option.checked
                  ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-600/30'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary-400 dark:hover:border-primary-500'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

