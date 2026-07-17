import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContentVariant } from '../MessageContentBody';
import { linkPreviewMutedClass, linkPreviewSurfaceClass } from './linkPreviewStyles';

type LinkPreviewChipProps = {
  url: string;
  host: string;
  isApp: boolean;
  variant: ContentVariant;
  loading?: boolean;
  onClick?: (e: React.MouseEvent) => void;
};

export const LinkPreviewChip: React.FC<LinkPreviewChipProps> = ({
  url,
  host,
  isApp,
  variant,
  loading = false,
  onClick,
}) => {
  const { t } = useTranslation();
  const [imgErr, setImgErr] = useState(false);
  const favicon = isApp
    ? '/bandeja2-blue-45-icon.png'
    : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  const muted = linkPreviewMutedClass(variant);
  const label = isApp ? t('chat.linkPreview.brand', { defaultValue: 'Bandeja' }) : host;
  const aria = t('chat.linkPreview.openLink', { defaultValue: 'Open link' });

  const handleClick = (e: React.MouseEvent) => {
    if (isApp) e.preventDefault();
    onClick?.(e);
  };

  return (
    <a
      href={url}
      target={isApp ? undefined : '_blank'}
      rel={isApp ? undefined : 'noopener noreferrer'}
      onClick={handleClick}
      aria-label={`${aria}: ${label}`}
      data-testid="chat-link-preview-chip"
      className={`mt-1.5 flex min-h-[68px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs max-w-full min-w-0 transition-colors active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none ${linkPreviewSurfaceClass(variant)} ${loading ? 'opacity-90' : ''}`}
    >
      <span
        className={`relative flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-md ${loading ? 'animate-pulse motion-reduce:animate-none' : ''}`}
      >
        {!imgErr ? (
          <img
            src={favicon}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <ExternalLink className={`h-3.5 w-3.5 ${muted}`} aria-hidden />
        )}
      </span>
      <span className="truncate min-w-0 font-medium tracking-tight">{label}</span>
      {!isApp ? (
        <ExternalLink className={`ml-auto h-3.5 w-3.5 flex-shrink-0 opacity-60 ${muted}`} aria-hidden />
      ) : null}
    </a>
  );
};
