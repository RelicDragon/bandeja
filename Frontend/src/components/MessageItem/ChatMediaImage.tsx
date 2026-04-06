import React, { useEffect, useState } from 'react';
import { mediaCacheKeyForSrc, readCachedMediaResponse, writeCachedMediaResponse } from '@/services/chat/chatMediaCache';

type ChatMediaImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
};

export const ChatMediaImage: React.FC<ChatMediaImageProps> = ({ src, alt, className, style, onClick }) => {
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    setDisplaySrc(src);
  }, [src]);

  useEffect(() => {
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return;
    const key = mediaCacheKeyForSrc(src);
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      const hit = await readCachedMediaResponse(key);
      if (cancelled) return;
      if (hit) {
        try {
          const blob = await hit.blob();
          const obj = URL.createObjectURL(blob);
          revoked = obj;
          setDisplaySrc(obj);
        } catch {
          /* keep src */
        }
      }
      try {
        const res = await fetch(key, { mode: 'cors', credentials: 'omit' });
        if (!cancelled && res.ok) void writeCachedMediaResponse(key, res);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [src]);

  return (
    <img src={displaySrc || src} alt={alt} className={className} style={style} onClick={onClick} loading="lazy" />
  );
};
