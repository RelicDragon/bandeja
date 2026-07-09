import { useRef, useEffect } from 'react';

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const OTPInput = ({ value, onChange, length = 6, disabled = false, autoFocus = false }: OTPInputProps) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    inputRefs.current[0]?.focus();
  }, [autoFocus, disabled]);

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
    <div
      className="mx-auto grid w-full max-w-[320px] gap-1.5 sm:gap-2"
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`One-time code digit ${index + 1}`}
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onInput={(e) => handleInput(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className="h-12 min-w-0 rounded-xl border border-slate-200 bg-white text-center text-xl font-bold text-slate-900 shadow-sm transition-all placeholder:text-slate-300 focus:border-[#0088cc] focus:outline-none focus:ring-4 focus:ring-[#0088cc]/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800/80 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-400/20 dark:disabled:bg-slate-900"
        />
      ))}
    </div>
  );
};
