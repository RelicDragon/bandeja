interface WelcomeOptionCardProps {
  option: string;
  label: string;
  name: string;
  checked: boolean;
  onSelect: () => void;
}

const base =
  'flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 cursor-pointer';
const selected =
  'border-primary-500 bg-primary-50 dark:bg-primary-900/25 dark:border-primary-500 ring-1 ring-primary-500/20';
const unselected =
  'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-500';

export const WelcomeOptionCard = ({
  option,
  label,
  name,
  checked,
  onSelect,
}: WelcomeOptionCardProps) => (
  <label
    className={`${base} ${checked ? selected : unselected}`}
  >
    <input
      type="radio"
      name={name}
      value={option}
      checked={checked}
      onChange={onSelect}
      className="mt-1 accent-primary-600 dark:accent-primary-500"
    />
    <span className="text-sm text-slate-700 dark:text-slate-200 leading-snug">
      {label}
    </span>
  </label>
);
