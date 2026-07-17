import React, { useEffect, useRef, useState } from 'react';
import type { LinkPreviewData } from '@/api/linkPreview';
import type { ContentVariant } from './MessageContentBody';
import { LinkPreviewCard } from './linkPreview/LinkPreviewCard';
import { LinkPreviewChip } from './linkPreview/LinkPreviewChip';
import { useLinkPreview } from './linkPreview/useLinkPreview';
import { isAppLinkPreviewHost, isEligibleLinkPreviewUrl } from './linkPreview/eligibility';
import { MessageCircle, RotateCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveGamePreviewUrls } from './linkPreview/gamePreviewUrls';

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
  initialPreview?: LinkPreviewData | null;
  onUrlClick?: (url: string, e: React.MouseEvent) => void;
  canDismiss?: boolean;
  onDismiss?: () => Promise<void> | void;
  onLoadedBandejaChange?: (loaded: boolean) => void;
  standalone?: boolean;
};

export const MessageExternalLinkPreview: React.FC<MessageExternalLinkPreviewProps> = ({
  url,
  variant,
  initialPreview,
  onUrlClick,
  canDismiss = false,
  onDismiss,
  onLoadedBandejaChange,
  standalone = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const [dismissing, setDismissing] = useState(false);
  const host = hostnameOnly(url);
  const eligible = isEligibleLinkPreviewUrl(url);
  const { status, preview, canRetry, retry } = useLinkPreview(
    eligible ? url : null,
    rootRef,
    initialPreview
  );
  const isApp = host ? isAppLinkPreviewHost(host) : false;
  const gameUrls =
    status === 'ready' && preview
      ? resolveGamePreviewUrls(url, preview.entityType)
      : null;

  useEffect(() => {
    onLoadedBandejaChange?.(status === 'ready' && preview?.source === 'bandeja');
  }, [onLoadedBandejaChange, preview?.source, status]);

  if (!host || !eligible) return null;

  const handleClick = (e: React.MouseEvent, navigationUrl = url) => {
    e.stopPropagation();
    onUrlClick?.(navigationUrl, e);
  };

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-full">
      {canDismiss ? (
        <button
          type="button"
          disabled={dismissing}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDismissing(true);
            void Promise.resolve(onDismiss?.()).finally(() => setDismissing(false));
          }}
          className="group absolute right-0 top-0 z-10 flex h-11 w-11 items-start justify-end rounded-full pr-1 pt-1 text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={t('chat.linkPreview.remove', { defaultValue: 'Remove link preview' })}
          title={t('chat.linkPreview.remove', { defaultValue: 'Remove link preview' })}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition-colors motion-reduce:transition-none ${
              variant === 'own'
                ? 'bg-white/15 ring-1 ring-white/20 group-hover:bg-white/25'
                : 'bg-slate-900/65 group-hover:bg-slate-900/85'
            }`}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
      ) : null}
      {gameUrls ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            handleClick(event, gameUrls.chatUrl);
          }}
          className={`group absolute right-0 z-10 flex h-11 w-11 items-start justify-end rounded-full pr-1 pt-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
            canDismiss ? 'top-10' : 'top-0'
          }`}
          aria-label={t('chat.openChat', { defaultValue: 'Open Chat' })}
          title={t('chat.openChat', { defaultValue: 'Open Chat' })}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition-colors motion-reduce:transition-none ${
              variant === 'own'
                ? 'bg-white/15 ring-1 ring-white/20 group-hover:bg-white/25'
                : 'bg-slate-900/65 group-hover:bg-slate-900/85'
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
      ) : null}
      {status === 'ready' && preview ? (
        <LinkPreviewCard
          url={url}
          navigationUrl={gameUrls?.gameUrl}
          preview={preview}
          variant={variant}
          standalone={standalone}
          reserveControlSpace={canDismiss || !!gameUrls}
          onClick={handleClick}
          instant
        />
      ) : (
        <>
          <LinkPreviewChip
            url={url}
            host={host}
            isApp={isApp}
            variant={variant}
            loading={status === 'loading'}
            onClick={handleClick}
          />
          {status === 'failed' ? (
            <button
              type="button"
              disabled={!canRetry}
              onClick={(event) => {
                event.stopPropagation();
                retry();
              }}
              className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-[11px] font-medium opacity-80 transition-opacity hover:opacity-100 disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              aria-label={t('chat.linkPreview.retry', { defaultValue: 'Retry link preview' })}
            >
              <RotateCw className="h-3 w-3" aria-hidden />
              {t('chat.linkPreview.retryShort', { defaultValue: 'Retry preview' })}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
};
