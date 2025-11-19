import { Camera } from 'lucide-react';
import { CachedImage } from './CachedImage';
import { UrlConstructor } from '@/utils/urlConstructor';

interface GameAvatarProps {
  avatar?: string | null;
  extrasmall?: boolean;
  small?: boolean;
  extralarge?: boolean;
  alt?: string;
}

export const GameAvatar = ({ avatar, extrasmall = false, small = false, extralarge = false, alt = 'Game avatar' }: GameAvatarProps) => {
  const getSizeClasses = () => {
    if (extrasmall) return 'w-8 h-8';
    if (small) return 'w-12 h-12';
    if (extralarge) return 'w-32 h-32';
    return 'w-16 h-16';
  };

  const getIconSize = () => {
    if (extrasmall) return 16;
    if (small) return 24;
    if (extralarge) return 48;
    return 32;
  };

  const sizeClasses = getSizeClasses();
  const iconSize = getIconSize();

  return (
    <div className={`${sizeClasses} rounded-full overflow-hidden flex-shrink-0 ${extralarge ? 'shadow-lg ring-2 ring-gray-200 dark:ring-gray-700 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''}`}>
      {avatar ? (
        <CachedImage
          src={UrlConstructor.constructImageUrl(avatar)}
          alt={alt}
          className="w-full h-full object-cover"
          showLoadingSpinner={true}
          loadingClassName="rounded-full"
        />
      ) : (
        <div className={`w-full h-full rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center`}>
          <Camera size={iconSize} className="text-gray-400 dark:text-gray-600" />
        </div>
      )}
    </div>
  );
};

