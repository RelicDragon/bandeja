import { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = ({ label, error, className = '', ...props }: InputProps) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 focus:border-primary-500 dark:focus:border-primary-400 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all ${
          error ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-600'
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-sm text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
};
