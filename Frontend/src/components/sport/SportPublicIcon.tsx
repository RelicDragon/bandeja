import type { ImgHTMLAttributes } from 'react';
import type { Sport } from '@/types';
import { getSportPublicIcon } from '@/sport/sportPublicIcon';

type SportPublicIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  sport: Sport;
  /** Intrinsic width/height attributes; a sizing `className` (e.g. `h-5 w-5`) still wins. */
  size?: number;
};

export function SportPublicIcon({
  sport,
  className = 'h-6 w-6 object-contain',
  size,
  ...rest
}: SportPublicIconProps) {
  return (
    <img
      draggable={false}
      width={size}
      height={size}
      {...rest}
      src={getSportPublicIcon(sport)}
      alt=""
      className={className}
    />
  );
}
