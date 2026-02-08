interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline' | 'emerald' | 'amber' | 'violet';
  className?: string;
}

const variants = {
  default: 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300',
  secondary: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  outline: 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
};

export const Badge = ({ children, variant = 'default', className = '' }: BadgeProps) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]} ${className}`}>
    {children}
  </span>
);
