import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { agentImageUrl, useAgentImages } from '@/features/agent/agentImages';

/**
 * A picture inside an assistant reply (`![caption](img:<id>)`). Renders only an image a
 * `web_images` step of this chat returned (via the signed proxy); unknown ids and failed
 * loads render nothing. Tap opens the fullscreen viewer, swiping through the chat's pictures.
 * Spans only: it sits inside the markdown paragraph.
 */
export const AgentInlineImage = memo(function AgentInlineImage({ id, caption }: { id: string; caption: string }) {
  const { t } = useTranslation();
  const { byId, open } = useAgentImages();
  const image = byId.get(id);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  if (!image || status === 'error') return null;

  const label = caption.trim() || image.alt;
  const aspectRatio = image.width && image.height ? `${image.width} / ${image.height}` : undefined;

  return (
    <span className="my-1.5 me-2 inline-block max-w-full align-top">
      <button
        type="button"
        onClick={() => open(image.id)}
        aria-label={label ? t('agent.web.openImageNamed', { name: label }) : t('agent.web.openImage')}
        className={`group relative block max-w-full overflow-hidden rounded-xl bg-gray-100 transition-transform active:scale-[0.98] dark:bg-gray-800 ${
          status === 'loading' ? 'min-w-[9rem] animate-pulse motion-reduce:animate-none' : ''
        }`}
        style={{ aspectRatio }}
      >
        <img
          src={agentImageUrl(image.src)}
          alt={label}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          className={`block h-48 w-auto max-w-full object-cover transition-opacity duration-300 ${
            status === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {status === 'ready' ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2 pb-1.5 pt-6 text-start">
            {label ? (
              <span className="line-clamp-2 text-xs font-medium leading-snug text-white" dir="auto">
                {label}
              </span>
            ) : null}
            {image.host ? (
              <span className="truncate text-[10px] leading-tight text-white/75" dir="ltr">
                {image.host}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
    </span>
  );
});
