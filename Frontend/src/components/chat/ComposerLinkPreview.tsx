import { RotateCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LinkPreviewData, LinkPreviewOutcome } from '@/api/linkPreview';
import { LinkPreviewCard } from '@/components/MessageItem/linkPreview/LinkPreviewCard';
import { LinkPreviewChip } from '@/components/MessageItem/linkPreview/LinkPreviewChip';

type Props = {
  urls: string[];
  selectedUrl: string | null;
  preview: LinkPreviewData | null;
  loading: boolean;
  outcome: LinkPreviewOutcome;
  disabled: boolean;
  canRetry: boolean;
  onSelect: (url: string) => void;
  onRemove: () => void;
  onRetry: () => void;
};

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export function ComposerLinkPreview({
  urls,
  selectedUrl,
  preview,
  loading,
  outcome,
  disabled,
  canRetry,
  onSelect,
  onRemove,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  if (!selectedUrl || disabled) return null;

  return (
    <section
      className="relative mb-2 rounded-2xl border border-gray-200/80 bg-white/85 p-2 shadow-sm backdrop-blur-xl dark:border-gray-700 dark:bg-gray-900/80"
      aria-label={t('chat.linkPreview.composerPreview', { defaultValue: 'Link preview' })}
      aria-busy={loading}
      data-testid="chat-composer-link-preview"
    >
      {loading ? (
        <span className="sr-only" role="status">
          {t('chat.linkPreview.loading', { defaultValue: 'Loading link preview' })}
        </span>
      ) : null}
      {urls.length > 1 ? (
        <div className="mb-1.5 flex min-h-11 items-center pr-12">
          <select
            value={selectedUrl}
            onChange={(event) => onSelect(event.target.value)}
            className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            aria-label={t('chat.linkPreview.chooseLink', { defaultValue: 'Choose link to preview' })}
          >
            {urls.map((url, index) => (
              <option key={url} value={url}>
                {index + 1}. {host(url)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="group absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300"
        aria-label={t('chat.linkPreview.remove', { defaultValue: 'Remove link preview' })}
        title={t('chat.linkPreview.remove', { defaultValue: 'Remove link preview' })}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100/90 transition-colors group-hover:bg-gray-200 motion-reduce:transition-none dark:bg-gray-800 dark:group-hover:bg-gray-700">
          <X className="h-4 w-4" aria-hidden />
        </span>
      </button>
      {preview ? (
        <LinkPreviewCard
          url={selectedUrl}
          preview={preview}
          variant="other"
          instant
          reserveControlSpace={urls.length === 1}
        />
      ) : (
        <div className={urls.length === 1 ? 'pr-10' : undefined}>
          <LinkPreviewChip
            url={selectedUrl}
            host={host(selectedUrl)}
            isApp={/(^|\.)bandeja\.me$/i.test(host(selectedUrl))}
            variant="other"
            loading={loading}
          />
        </div>
      )}
      {!loading && outcome === 'temporary' ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={!canRetry}
          className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
          aria-label={t('chat.linkPreview.retry', { defaultValue: 'Retry link preview' })}
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          {t('chat.linkPreview.retryShort', { defaultValue: 'Retry preview' })}
        </button>
      ) : null}
    </section>
  );
}
