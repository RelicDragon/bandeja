import React from 'react';
import { useImageCache } from '@/hooks/useImageCache';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallbackSrc?: string;
  showLoadingSpinner?: boolean;
  loadingClassName?: string;
}

export const CachedImage: React.FC<CachedImageProps> = ({
  src,
  fallbackSrc,
  showLoadingSpinner = false,
  loadingClassName = '',
  className = '',
  alt,
  ...props
}) => {
  const { cachedUrl, isLoading, error } = useImageCache(src);
  
  const imageSrc = error && fallbackSrc ? fallbackSrc : (cachedUrl || src);
  
  return (
    <div className="relative">
      {isLoading && showLoadingSpinner && (
        <div className={`absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 ${loadingClassName}`}>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
        </div>
      )}
      <img
        {...props}
        src={imageSrc}
        alt={alt}
        className={`${className} ${isLoading && showLoadingSpinner ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
        onError={(e) => {
          if (fallbackSrc && e.currentTarget.src !== fallbackSrc) {
            e.currentTarget.src = fallbackSrc;
          }
        }}
      />
    </div>
  );
};
