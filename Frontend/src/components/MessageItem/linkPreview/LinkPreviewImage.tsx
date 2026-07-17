import React, { useEffect, useState } from 'react';
import api from '@/api/axios';
import { resolveLinkPreviewImageSrc } from '@/api/linkPreview';
import { isDirectLinkPreviewMediaUrl } from './linkPreviewMediaUrl';

type PreviewImageProps = {
  src: string | null;
  className: string;
  fallback: React.ReactNode;
  rounded?: string;
};

function resolveImmediateDisplaySrc(src: string | null): string | null | undefined {
  if (!src) return null;
  if (src.startsWith('/link-preview/image')) {
    return resolveLinkPreviewImageSrc(src);
  }
  if (
    src.startsWith('/') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    isDirectLinkPreviewMediaUrl(src)
  ) {
    return src;
  }
  try {
    return new URL(src).protocol === 'https:' ? undefined : src;
  } catch {
    return src;
  }
}

/**
 * Loads preview thumbs:
 * - `/link-preview/image?...` HMAC proxy → absolute API URL
 * - external https → auth `/link-preview/media` blob (no sticky expired HMAC)
 * - relative / same-origin / bandeja assets → as-is
 */
export function LinkPreviewImage({ src, className, fallback, rounded = 'rounded-xl' }: PreviewImageProps) {
  const immediateDisplaySrc = resolveImmediateDisplaySrc(src);
  const [loaded, setLoaded] = useState<{ source: string; displaySrc: string } | null>(null);
  const [errorSource, setErrorSource] = useState<string | null>(null);
  const displaySrc =
    immediateDisplaySrc !== undefined
      ? immediateDisplaySrc
      : loaded?.source === src
        ? loaded.displaySrc
        : null;
  const err = src != null && errorSource === src;

  useEffect(() => {
    if (!src || immediateDisplaySrc !== undefined) return;

    const ac = new AbortController();
    let objectUrl: string | null = null;
    void api
      .get<Blob>('/link-preview/media', {
        params: { url: src },
        responseType: 'blob',
        signal: ac.signal,
        timeout: 8_000,
      })
      .then((res) => {
        if (ac.signal.aborted) return;
        objectUrl = URL.createObjectURL(res.data);
        setLoaded({ source: src, displaySrc: objectUrl });
      })
      .catch(() => {
        if (!ac.signal.aborted) setErrorSource(src);
      });

    return () => {
      ac.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [immediateDisplaySrc, src]);

  if (err || !src) return <>{fallback}</>;
  if (!displaySrc) {
    return (
      <span
        className={`block flex-shrink-0 ${className} ${rounded} bg-black/5 animate-pulse motion-reduce:animate-none`}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={displaySrc}
      alt=""
      className={`block flex-shrink-0 ${className} ${rounded} object-cover bg-black/5`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (src) setErrorSource(src);
      }}
    />
  );
}
