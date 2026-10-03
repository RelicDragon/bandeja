import { memo, type ComponentProps } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { classifyAgentLink } from '@/features/agent/agentLinks';
import { agentImageRefId } from '@/features/agent/agentImages';
import { useSmoothText } from '@/features/agent/useSmoothText';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { AgentInlineImage } from './AgentInlineImage';

interface AgentMarkdownProps {
  text: string;
  streaming?: boolean;
  /** Type the text out even when not streaming (a reply that arrived whole after the chat opened). */
  animate?: boolean;
}

function AgentLink({ href, children }: ComponentProps<'a'>) {
  const navigate = useNavigate();
  const target = classifyAgentLink(href);
  if (target.kind === 'blocked') return <span>{children}</span>;
  return (
    <a
      href={target.kind === 'internal' ? target.path : target.url}
      className="font-medium text-primary-600 underline decoration-primary-300 underline-offset-2 dark:text-primary-400"
      onClick={(e) => {
        e.preventDefault();
        if (target.kind === 'internal') navigate(target.path);
        else void openExternalUrl(target.url);
      }}
    >
      {children}
    </a>
  );
}

const COMPONENTS: Components = {
  a: AgentLink,
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 ps-5">{children}</ol>,
  h1: ({ children }) => <p className="mb-1 mt-2 text-base font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-1 mt-2 text-base font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 mt-2 font-semibold">{children}</p>,
  code: ({ children }) => (
    <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] dark:bg-gray-700/70">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-gray-100 p-2 text-xs dark:bg-gray-900/70">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-s-2 border-gray-300 ps-3 text-gray-600 dark:border-gray-600 dark:text-gray-300">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-gray-200 px-2 py-1 text-start font-semibold dark:border-gray-700">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-gray-100 px-2 py-1 dark:border-gray-800">{children}</td>,
  // Only `img:<id>` pictures from this chat's `web_images` steps; any other URL renders nothing.
  img: ({ src, alt }) => {
    const id = agentImageRefId(typeof src === 'string' ? src : null);
    return id ? <AgentInlineImage id={id} caption={alt ?? ''} /> : null;
  },
};

/** Keeps `img:<id>` image refs (the default transform would blank the unknown scheme). */
const urlTransform: UrlTransform = (url, key) =>
  key === 'src' && agentImageRefId(url) ? url : defaultUrlTransform(url);

/** While typing, hide a half-written picture (`![cap](img:ab`) instead of flashing its syntax. */
function hidePartialImage(text: string): string {
  return text.replace(/!\[[^\]\n]*(?:\]\([^)\n]*)?$/, '');
}

/**
 * Assistant markdown: GFM, no raw HTML (react-markdown's default), links vetted by `classifyAgentLink`.
 * Streamed text eases in (`useSmoothText`) instead of landing in network-sized chunks.
 */
export const AgentMarkdown = memo(function AgentMarkdown({ text, streaming = false, animate = false }: AgentMarkdownProps) {
  const smooth = useSmoothText(text, streaming || animate);
  const typing = streaming || smooth.revealing;
  return (
    <div className="agent-markdown break-words text-[15px] leading-relaxed" dir="auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} urlTransform={urlTransform} skipHtml>
        {typing ? hidePartialImage(smooth.text) : smooth.text}
      </ReactMarkdown>
      {typing ? (
        <span
          aria-hidden
          className="ms-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-gray-400 dark:bg-gray-500"
        />
      ) : null}
    </div>
  );
});
