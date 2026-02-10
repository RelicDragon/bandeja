import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PriceCurrency } from '@/types';
import { getCurrencyOptions, CURRENCY_INFO } from '@/utils/currency';

const validatePriceInput = (v: string, currency: PriceCurrency): string => {
  const noE = v.replace(/[eE+-]/g, '');
  const digitsAndDot = noE.replace(/[^0-9.]/g, '');
  const parts = digitsAndDot.split('.');
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');

  // Get decimal places for the currency
  const decimals = CURRENCY_INFO[currency]?.decimals || 2;
  if (parts[1] && parts[1].length > decimals) {
    return parts[0] + '.' + parts[1].slice(0, decimals);
  }

  return digitsAndDot;
};

const CURRENCIES = getCurrencyOptions();

interface PriceInputWithCurrencyProps {
  value: string;
  onChange: (v: string) => void;
  currency: PriceCurrency;
  onCurrencyChange: (v: PriceCurrency) => void;
  placeholder?: string;
  className?: string;
}

export const PriceInputWithCurrency = ({
  value,
  onChange,
  currency,
  onCurrencyChange,
  placeholder = '0.00',
  className = '',
}: PriceInputWithCurrencyProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div
      ref={ref}
      className={`flex items-stretch rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 focus-within:ring-2 focus-within:ring-primary-500/20 dark:focus-within:ring-primary-400/20 focus-within:border-primary-500 dark:focus-within:border-primary-400 ${className}`}
    >
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(validatePriceInput(e.target.value, currency))}
        onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent px-3 py-2 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none border-0 rounded-l-lg"
      />
      <div className="relative border-l border-slate-200 dark:border-slate-600">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 px-3 py-2 text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600/50 rounded-r-lg"
        >
          <span>{currency}</span>
          <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 py-1 z-50 min-w-[4rem] bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg">
            {CURRENCIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  onCurrencyChange(c.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm ${
                  c.value === currency ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
