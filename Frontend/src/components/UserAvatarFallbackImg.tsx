import { useLayoutEffect, useRef, useState } from 'react';
import { avatarImageElementIsPainted } from '@/utils/userAvatarImageFallback';

type UserAvatarFallbackImgProps = {
  src: string;
  alt: string;
  className?: string;
  onError: () => void;
};

export function UserAvatarFallbackImg({ src, alt, className, onError }: UserAvatarFallbackImgProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const failedSrcRef = useRef<string | null>(null);
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null);
  const ready = paintedSrc === src;

  if (failedSrcRef.current !== null && failedSrcRef.current !== src) {
    failedSrcRef.current = null;
  }

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && avatarImageElementIsPainted(img)) {
      setPaintedSrc(src);
    }
  }, [src]);

  return (
    <img
      ref={imgRef}
      key={src}
      src={src}
      alt={alt}
      className={className}
      style={ready ? undefined : { visibility: 'hidden' }}
      onLoad={() => setPaintedSrc(src)}
      onError={() => {
        if (failedSrcRef.current === src) return;
        failedSrcRef.current = src;
        if (imgRef.current) imgRef.current.style.visibility = 'hidden';
        setPaintedSrc((current) => (current === src ? null : current));
        onError();
      }}
    />
  );
}
