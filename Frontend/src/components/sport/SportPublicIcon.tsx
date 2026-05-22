import type { Sport } from '@/types';
import { getSportPublicIcon } from '@/sport/sportPublicIcon';

type SportPublicIconProps = {
  sport: Sport;
  className?: string;
};

export function SportPublicIcon({ sport, className = 'h-6 w-6 object-contain' }: SportPublicIconProps) {
  return (
    <img
      src={getSportPublicIcon(sport)}
      alt=""
      className={className}
      draggable={false}
    />
  );
}
