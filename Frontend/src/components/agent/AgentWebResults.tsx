import { memo, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import type { AgentWebImage, AgentWebView } from '@shared/agentContract';
import { agentImageUrl, useAgentImages } from '@/features/agent/agentImages';
import { openExternalUrl } from '@/utils/openExternalUrl';

/**
 * A web tool step's details (Phase 13, port of travel-bandeja `WebSearchResults.jsx`):
 * meta line (count · provider · cached), the provider's summary, and the result links
 * (title, host, snippet). Fetch steps show the page link. Built only from the server's
 * `web` view, never from model text; http(s) links only.
 */

const PROVIDER_LABELS: Record<string, string> = {
  tavily: 'Tavily',
  brave: 'Brave',
  duckduckgo: 'DuckDuckGo',
};

function providerLabel(name: string | null): string {
  return name ? (PROVIDER_LABELS[name] ?? name) : '—';
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'info' }) {
  return (
    <span
      className={`rounded-full px-1.5 py-px text-[10px] font-medium ${
        tone === 'info'
          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300'
      }`}
    >
      {children}
    </span>
  );
}

function ResultLink({ url, title, host, snippet }: { url: string; title: string; host: string; snippet?: string }) {
  if (!isHttpUrl(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        void openExternalUrl(url);
      }}
      className="group block min-w-0 rounded-xl px-2 py-1.5 transition-colors hover:bg-gray-100 active:bg-gray-100 dark:hover:bg-gray-800/70 dark:active:bg-gray-800/70"
    >
      <span className="flex min-w-0 items-center gap-1">
        <span
          className="truncate text-[13px] font-medium text-gray-800 group-hover:text-primary-600 dark:text-gray-100 dark:group-hover:text-primary-400"
          dir="auto"
        >
          {title || host}
        </span>
        <ExternalLink size={12} className="flex-shrink-0 text-gray-400" aria-hidden />
      </span>
      <span className="block truncate font-mono text-[11px] text-emerald-700/80 dark:text-emerald-400/70" dir="ltr">
        {host}
      </span>
      {snippet ? (
        <span className="line-clamp-2 block text-xs leading-snug text-gray-500 dark:text-gray-400" dir="auto">
          {snippet}
        </span>
      ) : null}
    </a>
  );
}

export const AgentWebResults = memo(function AgentWebResults({ web }: { web: AgentWebView }) {
  const { t } = useTranslation();

  if (web.kind === 'fetch') {
    return (
      <div className="flex flex-col gap-1 border-s-2 border-gray-200 ps-2 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-1">
          {web.cached ? <Badge tone="info">{t('agent.web.cached')}</Badge> : null}
          {web.truncated ? <Badge>{t('agent.web.shortened')}</Badge> : null}
        </div>
        <ResultLink url={web.url} title={web.title ?? web.host} host={web.host} />
      </div>
    );
  }

  const trail = web.tried
    .map((step) => {
      const kind = step.error ?? step.skipped;
      return kind ? `${providerLabel(step.provider)} (${t(`agent.web.kind.${kind}`, { defaultValue: kind })})` : providerLabel(step.provider);
    })
    .join(' → ');

  return (
    <div className="flex flex-col gap-1.5 border-s-2 border-gray-200 ps-2 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span>{web.exhausted ? t('agent.web.failed') : t('agent.web.resultCount', { count: web.results.length })}</span>
        {web.provider ? <Badge>{providerLabel(web.provider)}</Badge> : null}
        {web.cached ? <Badge tone="info">{t('agent.web.cached')}</Badge> : null}
      </div>

      {web.exhausted ? (
        <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <p>{t('agent.web.exhaustedHint')}</p>
            {trail ? <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{t('agent.web.tried', { trail })}</p> : null}
          </div>
        </div>
      ) : (
        <>
          {web.answer ? (
            <div className="rounded-xl bg-gray-50 px-2 py-1.5 dark:bg-gray-800/60">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                {t('agent.web.summaryBy', { provider: providerLabel(web.provider) })}
              </p>
              <p className="text-xs leading-snug text-gray-700 dark:text-gray-200" dir="auto">
                {web.answer}
              </p>
            </div>
          ) : null}
          <div className="-mx-2 flex flex-col">
            {web.results.map((result, index) => (
              <ResultLink key={`${result.url}-${index}`} {...result} />
            ))}
          </div>
        </>
      )}
    </div>
  );
});

/** A `web_images` step's pictures: tap one to open the fullscreen viewer over this step's set. */
export const AgentWebImageStrip = memo(function AgentWebImageStrip({ images }: { images: readonly AgentWebImage[] }) {
  const { t } = useTranslation();
  const { open } = useAgentImages();
  // Pictures whose source failed: dropped from the strip and from the swipe set.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const shown = useMemo(() => images.filter((image) => !failed.has(image.id)), [images, failed]);
  if (!shown.length) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto border-s-2 border-gray-200 pb-1 ps-2 dark:border-gray-700">
      {shown.map((image) => (
        <button
          key={image.id}
          type="button"
          onClick={() => open(image.id, shown)}
          aria-label={image.alt ? t('agent.web.openImageNamed', { name: image.alt }) : t('agent.web.openImage')}
          title={image.host}
          className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 transition-transform active:scale-95 dark:bg-gray-800"
        >
          <img
            src={agentImageUrl(image.thumb)}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            className="h-full w-full object-cover"
            onError={() => setFailed((prev) => new Set(prev).add(image.id))}
          />
        </button>
      ))}
    </div>
  );
});
