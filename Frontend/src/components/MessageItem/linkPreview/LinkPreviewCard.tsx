import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { LinkPreviewData } from '@/api/linkPreview';
import type { ContentVariant } from '../MessageContentBody';

type LinkPreviewCardProps = {
  url: string;
  preview: LinkPreviewData;
  variant: ContentVariant;
};

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ url, preview, variant }) => {
  const [imgErr, setImgErr] = useState(false);
  const host = preview.hostname || preview.siteName || 'link';
  const title = preview.title?.trim() || host;
  const description = preview.description?.trim() || null;
  const showImage = !!preview.imageUrl && !imgErr;

  const surface =
    variant === 'own'
      ? 'border-white/25 bg-white/10 text-blue-50'
      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 text-gray-800 dark:text-gray-100';

  const muted = variant === 'own' ? 'text-blue-100/80' : 'text-gray-500 dark:text-gray-400';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      data-testid="chat-link-preview-card"
      className={`mt-1.5 block overflow-hidden rounded-xl border text-left max-w-full min-w-0 transition-opacity duration-200 ${surface}`}
    >
      {showImage && (
        <div className="relative w-full aspect-[16/9] max-h-40 bg-black/10 overflow-hidden">
          <img
            src={preview.imageUrl!}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgErr(true)}
          />
        </div>
      )}
      <div className="px-2.5 py-2 min-w-0">
        <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide ${muted}`}>
          <span className="truncate min-w-0 font-medium normal-case tracking-normal text-xs">
            {host}
          </span>
          <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-70 ml-auto" aria-hidden />
        </div>
        <p className="mt-0.5 text-sm font-semibold leading-snug line-clamp-2">{title}</p>
        {description && (
          <p className={`mt-0.5 text-xs leading-snug line-clamp-2 ${muted}`}>{description}</p>
        )}
      </div>
    </a>
  );
};
