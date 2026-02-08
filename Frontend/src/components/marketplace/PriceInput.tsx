import { INPUT_CLASS } from './constants';

const validatePriceInput = (v: string): string => {
  const noE = v.replace(/[eE+-]/g, '');
  const digitsAndDot = noE.replace(/[^0-9.]/g, '');
  const parts = digitsAndDot.split('.');
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
  if (parts[1] && parts[1].length > 2) return parts[0] + '.' + parts[1].slice(0, 2);
  return digitsAndDot;
};

interface PriceInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export const PriceInput = ({ value, onChange, placeholder, className = '' }: PriceInputProps) => (
  <input
    type="text"
    inputMode="decimal"
    value={value}
    onChange={(e) => onChange(validatePriceInput(e.target.value))}
    onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
    placeholder={placeholder}
    className={`${INPUT_CLASS} ${className}`}
  />
);
