import type { HTMLAttributes } from 'react';
import { Beer } from 'lucide-react';

type SocialLevelIconProps = Omit<HTMLAttributes<HTMLDivElement>, 'className'> & {
  size?: number;
  className?: string;
  foregroundClassName?: string;
};

export function SocialLevelIcon({
  size = 20,
  className,
  foregroundClassName = 'text-gray-700 dark:text-gray-200',
  ...rest
}: SocialLevelIconProps) {
  return (
    <div {...rest} className={`relative flex shrink-0 items-center ${className ?? ''}`}>
      <Beer
        size={size}
        className="absolute text-amber-600 dark:text-amber-500"
        fill="currentColor"
      />
      <Beer size={size} className={`relative z-10 ${foregroundClassName}`} strokeWidth={1.5} />
    </div>
  );
}
