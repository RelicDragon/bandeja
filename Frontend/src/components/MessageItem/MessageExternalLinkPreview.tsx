import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { ContentVariant } from './MessageContentBody';
import { LinkPreviewCard } from './linkPreview/LinkPreviewCard';
import { useLinkPreview } from './linkPreview/useLinkPreview';
import { isEligibleExternalLinkPreviewUrl } from './linkPreview/eligibility';

function hostnameOnly(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

type MessageExternalLinkPreviewProps = {
  url: string;
  variant: ContentVariant;
};

export const MessageExternalLinkPreview: React.FC<MessageExternalLinkPreviewProps> = ({
  url,
  variant,
}) => {
  const host = hostnameOnly(url);
  const [imgErr, setImgErr] = useState(false);
  const eligible = isEligibleExternalLinkPreviewUrl(url);
  const { status, preview } = useLinkPreview(eligible ? url : null);

  if (!host || !eligible) return null;

  if (status === 'ready' && preview) {
    return <LinkPreviewCard url={url} preview={preview} variant={variant} />;
  }

  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  const subtle =
    variant === 'own'
      ? 'border-white/25 bg-white/10 text-blue-50'
      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      data-testid="chat-link-preview-chip"
      className={`mt-1.5 flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs max-w-full min-w-0 ${subtle}`}
    >
      {!imgErr ? (
        <img
          src={favicon}
          alt=""
          width={20}
          height={20}
          className="rounded flex-shrink-0"
          onError={() => setImgErr(true)}
        />
      ) : (
        <ExternalLink className="w-4 h-4 flex-shrink-0 opacity-80" aria-hidden />
      )}
      <span className="truncate min-w-0 font-medium">{host}</span>
      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-70 ml-auto" aria-hidden />
    </a>
  );
};
