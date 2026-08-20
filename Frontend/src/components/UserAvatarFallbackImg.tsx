import { useState } from 'react';

type UserAvatarFallbackImgProps = {
  src: string;
  alt: string;
  className?: string;
  onError: () => void;
};

export function UserAvatarFallbackImg({ src, alt, className, onError }: UserAvatarFallbackImgProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const ready = loadedSrc === src;

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className={className}
      style={ready ? undefined : { visibility: 'hidden' }}
      onLoad={() => setLoadedSrc(src)}
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden';
        setLoadedSrc(null);
        onError();
      }}
    />
  );
}
