import { memo, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { classifyAgentLink } from '@/features/agent/agentLinks';
import { agentImageRefId } from '@/features/agent/agentImages';
import {
  agentCodeLanguage,
  agentCodeText,
  agentHastText,
  agentLinkEntityKind,
  isAgentNumericCell,
  type AgentHastNode,
  type AgentLinkEntityKind,
} from '@/features/agent/agentMarkdownElements';
import { copyAgentMessageText } from '@/features/agent/agentMessageShare';
import { useSmoothText } from '@/features/agent/useSmoothText';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { AgentInlineImage } from './AgentInlineImage';

interface AgentMarkdownProps {
  text: string;
  streaming?: boolean;
  /** Type the text out even when not streaming (a reply that arrived whole after the chat opened). */
  animate?: boolean;
}

const COPIED_MS = 1500;

const LINK_ICON: Record<AgentLinkEntityKind, LucideIcon> = {
  game: CalendarDays,
  club: MapPin,
  player: UserIcon,
  chat: MessageCircle,
  other: ArrowUpRight,
};

/** In-app links are compact chips (icon by destination); external links stay underlined with a ↗ glyph. */
function AgentLink({ href, children }: ComponentProps<'a'>) {
  const navigate = useNavigate();
  const target = classifyAgentLink(href);
  if (target.kind === 'blocked') return <span>{children}</span>;
  if (target.kind === 'internal') {
    const Icon = LINK_ICON[agentLinkEntityKind(target.path)];
    return (
      <a
        href={target.path}
        data-agent-link="internal"
        className="mx-px rounded-full bg-primary-50 px-1.5 py-px font-medium text-primary-700 no-underline [box-decoration-break:clone] [-webkit-box-decoration-break:clone] transition-colors hover:bg-primary-100 active:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50 dark:active:bg-primary-900/50"
        onClick={(e) => {
          e.preventDefault();
          navigate(target.path);
        }}
      >
        <Icon size={13} className="me-0.5 inline-block -translate-y-px align-middle" aria-hidden />
        {children}
      </a>
    );
  }
  return (
    <a
      href={target.url}
      data-agent-link="external"
      className="font-medium text-primary-600 underline decoration-primary-300 underline-offset-2 dark:text-primary-400 dark:decoration-primary-700"
      onClick={(e) => {
        e.preventDefault();
        void openExternalUrl(target.url);
      }}
    >
      {children}
      <ExternalLink size={12} className="ms-0.5 inline-block -translate-y-px align-middle opacity-70" aria-hidden />
    </a>
  );
}

/** Fenced code: language strip with a Copy button, scrolls sideways instead of wrapping. */
function AgentCodeBlock({ node }: { node?: AgentHastNode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );
  const language = agentCodeLanguage(node);
  const code = agentCodeText(node);

  const handleCopy = async () => {
    if (!(await copyAgentMessageText(code))) {
      toast.error(t('agent.message.copyFailed'));
      return;
    }
    setCopied(true);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/70" dir="ltr">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-100/80 py-0.5 pe-0.5 ps-3 dark:border-gray-700 dark:bg-gray-800/80">
        <span className="truncate font-mono text-[11px] lowercase text-gray-500 dark:text-gray-400">
          {language ?? t('agent.markdown.code')}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? t('common.copied') : t('agent.markdown.copyCode')}
          title={copied ? t('common.copied') : t('agent.markdown.copyCode')}
          className="flex h-8 flex-shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-gray-700 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 dark:active:bg-gray-700"
        >
          {copied ? (
            <Check size={14} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <Copy size={14} aria-hidden />
          )}
          <span>{copied ? t('common.copied') : t('common.copy')}</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs leading-relaxed text-gray-800 dark:text-gray-100">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/** GFM task-list box: the native (disabled) checkbox keeps the semantics, the dot is the look. */
function TaskCheckbox({ checked }: { checked: boolean }) {
  return (
    <span className="relative me-1.5 inline-flex h-4 w-4 flex-shrink-0 -translate-y-px align-middle">
      <input type="checkbox" checked={checked} disabled readOnly className="absolute inset-0 m-0 opacity-0" />
      <span
        aria-hidden
        className={`flex h-4 w-4 items-center justify-center rounded-full ${
          checked ? 'bg-emerald-500 text-white' : 'border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
        }`}
      >
        {checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
    </span>
  );
}

const hasClass = (className: string | undefined, name: string) => (className ?? '').split(/\s+/).includes(name);

const cellAlign = (align: unknown, style: ComponentProps<'td'>['style']) =>
  (typeof align === 'string' && align) || style?.textAlign || null;

function AgentTableCell({ node, children, style, ...rest }: ComponentProps<'td'> & { node?: AgentHastNode }) {
  const explicit = cellAlign((rest as { align?: unknown }).align, style);
  const numeric = !explicit && isAgentNumericCell(agentHastText(node));
  const align =
    explicit === 'right' ? 'text-end' : explicit === 'center' ? 'text-center' : numeric ? 'text-end tabular-nums' : 'text-start';
  return <td className={`px-3 py-2 align-top ${numeric ? 'whitespace-nowrap' : ''} ${align}`}>{children}</td>;
}

function AgentTableHeader({ children, style, ...rest }: ComponentProps<'th'> & { node?: AgentHastNode }) {
  const explicit = cellAlign((rest as { align?: unknown }).align, style);
  const align = explicit === 'right' ? 'text-end' : explicit === 'center' ? 'text-center' : 'text-start';
  return (
    <th className={`whitespace-nowrap px-3 py-2 font-semibold text-gray-700 dark:text-gray-200 ${align}`}>{children}</th>
  );
}

const heading = (Tag: 'h3' | 'h4' | 'h5', className: string) =>
  function AgentHeading({ children }: { children?: ReactNode }) {
    return <Tag className={className}>{children}</Tag>;
  };

const H_LARGE = heading('h3', 'mb-1 mt-3 text-base font-semibold first:mt-0');
const H_MEDIUM = heading('h4', 'mb-1 mt-2.5 font-semibold first:mt-0');
const H_SMALL = heading('h5', 'mb-0.5 mt-2 text-sm font-semibold text-gray-700 first:mt-0 dark:text-gray-200');

const COMPONENTS: Components = {
  a: AgentLink,
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children, className }) =>
    hasClass(className, 'contains-task-list') ? (
      <ul className="my-1.5 list-none space-y-0.5 ps-0.5">{children}</ul>
    ) : (
      <ul className="my-1.5 list-disc space-y-0.5 ps-5 marker:text-gray-400 dark:marker:text-gray-500">{children}</ul>
    ),
  ol: ({ children, start }) => (
    <ol start={start} className="my-1.5 list-decimal space-y-0.5 ps-5 marker:text-gray-500 dark:marker:text-gray-400">
      {children}
    </ol>
  ),
  li: ({ children, className }) => <li className={hasClass(className, 'task-list-item') ? 'list-none' : undefined}>{children}</li>,
  input: ({ type, checked }) => (type === 'checkbox' ? <TaskCheckbox checked={Boolean(checked)} /> : null),
  // Headings stay small inside a chat bubble but keep their semantics.
  h1: H_LARGE,
  h2: H_LARGE,
  h3: H_MEDIUM,
  h4: H_SMALL,
  h5: H_SMALL,
  h6: H_SMALL,
  // Inline only: fenced blocks render through `pre` → AgentCodeBlock (it never renders this `code`).
  code: ({ children }) => (
    <code className="rounded-md bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-gray-700/70 dark:text-gray-100">
      {children}
    </code>
  ),
  pre: ({ node }) => <AgentCodeBlock node={node as AgentHastNode | undefined} />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 rounded-e-xl border-s-4 border-primary-200 bg-gray-50 py-1 pe-3 ps-3 text-gray-600 dark:border-primary-800 dark:bg-gray-800/60 dark:text-gray-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-0 border-t border-gray-200 dark:border-gray-700" />,
  table: ({ children }) => (
    <div className="my-2 max-w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700" dir="auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{children}</tbody>,
  th: ({ node, ...props }) => <AgentTableHeader node={node as AgentHastNode | undefined} {...props} />,
  td: ({ node, ...props }) => <AgentTableCell node={node as AgentHastNode | undefined} {...props} />,
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
 * Pure in its props (the component map is static), so callers can memoize it per block.
 */
export const AgentMarkdown = memo(function AgentMarkdown({ text, streaming = false, animate = false }: AgentMarkdownProps) {
  const smooth = useSmoothText(text, streaming || animate);
  const typing = streaming || smooth.revealing;
  return (
    <div className="agent-markdown min-w-0 break-words text-[15px] leading-relaxed" dir="auto">
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
