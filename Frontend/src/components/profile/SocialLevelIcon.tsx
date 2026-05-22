import { Beer } from 'lucide-react';

type SocialLevelIconProps = {
  size?: number;
  className?: string;
  foregroundClassName?: string;
};

export function SocialLevelIcon({
  size = 20,
  className,
  foregroundClassName = 'text-gray-700 dark:text-gray-200',
}: SocialLevelIconProps) {
  return (
    <div className={`relative flex shrink-0 items-center ${className ?? ''}`}>
      <Beer
        size={size}
        className="absolute text-amber-600 dark:text-amber-500"
        fill="currentColor"
      />
      <Beer size={size} className={`relative z-10 ${foregroundClassName}`} strokeWidth={1.5} />
    </div>
  );
}
