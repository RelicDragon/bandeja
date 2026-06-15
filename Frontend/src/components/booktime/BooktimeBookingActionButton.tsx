import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger';
};

export function BooktimeBookingActionButton({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: Props) {
  const variants = {
    primary:
      'border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/40 focus-visible:ring-primary-500',
    danger:
      'border border-red-200 dark:border-red-800/60 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 focus-visible:ring-red-500',
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
