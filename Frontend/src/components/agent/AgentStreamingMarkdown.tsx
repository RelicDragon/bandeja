import { memo, useMemo } from 'react';
import { useSmoothText } from '@/features/agent/useSmoothText';
import { hidePartialAgentImage, splitAgentMarkdownBlocks } from '@/features/agent/agentMarkdownBlocks';
import { AgentMarkdown } from './AgentMarkdown';

interface AgentStreamingMarkdownProps {
  text: string;
  streaming?: boolean;
  /** Type the text out even when not streaming (a reply that arrived whole after the chat opened). */
  animate?: boolean;
}

/**
 * Assistant reply split into top-level markdown blocks (`splitAgentMarkdownBlocks`), each its
 * own memoized `AgentMarkdown` keyed by index: while the reply types out (`useSmoothText`, up to
 * a commit per frame) only the last, growing block re-parses. `aria-busy` while typing so
 * screen readers in the thread's live log don't announce every character.
 */
export const AgentStreamingMarkdown = memo(function AgentStreamingMarkdown({
  text,
  streaming = false,
  animate = false,
}: AgentStreamingMarkdownProps) {
  const smooth = useSmoothText(text, streaming || animate);
  const typing = streaming || smooth.revealing;
  const shown = typing ? hidePartialAgentImage(smooth.text) : smooth.text;
  const blocks = useMemo(() => splitAgentMarkdownBlocks(shown), [shown]);

  return (
    <div className="space-y-1.5" aria-busy={typing || undefined}>
      {blocks.map((block, i) => (
        <AgentMarkdown key={i} text={block} />
      ))}
      {typing ? (
        <span
          aria-hidden
          className="ms-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-gray-400 dark:bg-gray-500"
        />
      ) : null}
    </div>
  );
});
