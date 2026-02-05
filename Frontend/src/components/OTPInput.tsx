import { useRef, useEffect } from 'react';

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

export const OTPInput = ({ value, onChange, length = 6, disabled = false }: OTPInputProps) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  const handleChange = (index: number, val: string) => {
    if (disabled) return;

    if (!/^\d*$/.test(val)) return;

    const newValue = value.split('');
    newValue[index] = val;
    const updatedValue = newValue.join('').slice(0, length);
    onChange(updatedValue);

    if (val && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pastedData = e.clipboardData.getData('text').trim().replace(/\D/g, '').slice(0, length);
    if (pastedData.length > 0) {
      onChange(pastedData);
      const nextIndex = Math.min(pastedData.length - 1, length - 1);
      setTimeout(() => {
        inputRefs.current[nextIndex]?.focus();
      }, 0);
    }
  };

  const handleInput = (index: number, e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (input.value.length > 1) {
      e.preventDefault();
      const pastedData = input.value.trim().replace(/\D/g, '').slice(0, length);
      if (pastedData.length > 0) {
        onChange(pastedData);
        const nextIndex = Math.min(pastedData.length - 1, length - 1);
        setTimeout(() => {
          inputRefs.current[nextIndex]?.focus();
        }, 0);
      }
      input.value = value[index] || '';
    }
  };

  return (
    <div className="flex gap-1.5 justify-center min-w-0">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onInput={(e) => handleInput(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className="w-10 h-11 text-center text-lg font-semibold bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 focus:outline-none disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed transition-all text-slate-800 dark:text-white"
        />
      ))}
    </div>
  );
};
