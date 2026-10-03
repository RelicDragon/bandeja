import type {
  AgentEntityRef,
  AgentMessageDto,
  AgentPendingActionDto,
  AgentWebView,
} from '@shared/agentContract';
import type { AgentMemorySaved, AgentRunLiveState } from './agentRunReducer';
import { isTerminalPhase } from './agentRunReducer';

export interface AgentToolItemData {
  callId: string;
  label: string;
  status: 'running' | 'ok' | 'error';
  summary: string | null;
  entities: AgentEntityRef[];
  /** Phase 11: this call saved a memory (live runs only): "Saved to memory · Undo". */
  memorySaved?: AgentMemorySaved;
  /** Web search / fetch view (Phase 13): provider, cached, answer, links. */
  web?: AgentWebView;
}

export type AgentTimelineItem =
  | { kind: 'user'; key: string; messageId: string; seq: number; text: string }
  | { kind: 'assistantText'; key: string; text: string; streaming: boolean }
  | { kind: 'tool'; key: string; tool: AgentToolItemData }
  | { kind: 'action'; key: string; actionId: string; action: AgentPendingActionDto | null };

function textOf(message: AgentMessageDto): string {
  return message.blocks
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Merge persisted messages with the live run into one render list. Persisted content wins;
 * live content is appended only for what is not saved yet. Tool calls and their results are
 * joined by `callId` across messages (the result may arrive in a later TOOL message or live).
 */
export function buildAgentTimeline(
  messages: readonly AgentMessageDto[],
  actions: readonly AgentPendingActionDto[],
  live: AgentRunLiveState | null,
): AgentTimelineItem[] {
  const actionById = new Map<string, AgentPendingActionDto>();
  for (const a of actions) actionById.set(a.id, a);
  if (live) {
    for (const a of Object.values(live.actions)) {
      if (!actionById.has(a.id)) actionById.set(a.id, a);
    }
  }

  const persistedResults = new Map<
    string,
    { ok: boolean; summary: string; entities: AgentEntityRef[]; web?: AgentWebView }
  >();
  const persistedCalls = new Set<string>();
  for (const m of messages) {
    for (const b of m.blocks) {
      if (b.type === 'tool_result') {
        persistedResults.set(b.callId, {
          ok: b.ok,
          summary: b.summary,
          entities: b.entities ?? [],
          ...(b.web ? { web: b.web } : {}),
        });
      } else if (b.type === 'tool_call') {
        persistedCalls.add(b.callId);
      }
    }
  }

  const liveRunning = live != null && !isTerminalPhase(live.phase);
  const items: AgentTimelineItem[] = [];
  const renderedCalls = new Set<string>();
  const renderedActions = new Set<string>();

  const memoryOf = (callId: string): { memorySaved?: AgentMemorySaved } => {
    const saved = live?.memorySaves?.[callId];
    return saved ? { memorySaved: saved } : {};
  };

  const toolFor = (callId: string, fallbackLabel: string): AgentToolItemData => {
    const result = persistedResults.get(callId);
    if (result) {
      return {
        callId,
        label: fallbackLabel,
        status: result.ok ? 'ok' : 'error',
        summary: result.summary,
        entities: result.entities,
        ...memoryOf(callId),
        ...(result.web ? { web: result.web } : {}),
      };
    }
    const step = live?.tools[callId];
    if (step) {
      return {
        callId,
        label: step.label || fallbackLabel,
        // A persisted call without a result in a finished run: the step never completed.
        status: step.status === 'running' && !liveRunning ? 'error' : step.status,
        summary: step.summary,
        entities: step.entities,
        ...memoryOf(callId),
        ...(step.web ? { web: step.web } : {}),
      };
    }
    return { callId, label: fallbackLabel, status: liveRunning ? 'running' : 'error', summary: null, entities: [] };
  };

  for (const m of messages) {
    if (m.role === 'USER') {
      const text = textOf(m);
      if (text) items.push({ kind: 'user', key: `m-${m.id}`, messageId: m.id, seq: m.seq, text });
      continue;
    }
    m.blocks.forEach((b, i) => {
      const key = `m-${m.id}-${i}`;
      if (b.type === 'text') {
        if (b.text.trim()) items.push({ kind: 'assistantText', key, text: b.text, streaming: false });
      } else if (b.type === 'tool_call') {
        if (renderedCalls.has(b.callId)) return;
        renderedCalls.add(b.callId);
        items.push({ kind: 'tool', key, tool: toolFor(b.callId, b.label) });
      } else if (b.type === 'tool_result') {
        if (persistedCalls.has(b.callId) || renderedCalls.has(b.callId)) return;
        renderedCalls.add(b.callId);
        items.push({
          kind: 'tool',
          key,
          tool: {
            callId: b.callId,
            label: b.summary,
            status: b.ok ? 'ok' : 'error',
            summary: b.summary,
            entities: b.entities ?? [],
            ...(b.web ? { web: b.web } : {}),
          },
        });
      } else if (b.type === 'action') {
        if (renderedActions.has(b.actionId)) return;
        renderedActions.add(b.actionId);
        items.push({ kind: 'action', key, actionId: b.actionId, action: actionById.get(b.actionId) ?? null });
      }
    });
  }

  if (live) {
    live.segments.forEach((s, i) => {
      const key = `live-${live.runId}-${i}`;
      if (s.kind === 'text') {
        if (s.text) {
          const isLast = i === live.segments.length - 1;
          items.push({ kind: 'assistantText', key, text: s.text, streaming: liveRunning && isLast });
        }
      } else if (s.kind === 'tool') {
        if (renderedCalls.has(s.callId)) return;
        renderedCalls.add(s.callId);
        const step = live.tools[s.callId];
        items.push({ kind: 'tool', key, tool: toolFor(s.callId, step?.label ?? '') });
      } else if (s.kind === 'action') {
        if (renderedActions.has(s.actionId)) return;
        renderedActions.add(s.actionId);
        items.push({ kind: 'action', key, actionId: s.actionId, action: actionById.get(s.actionId) ?? null });
      }
    });
  }

  return items;
}

export type AgentRenderItem =
  | Exclude<AgentTimelineItem, { kind: 'tool' }>
  | { kind: 'toolGroup'; key: string; tools: AgentToolItemData[] };

/**
 * What the chat renders: consecutive tool steps fold into one group, and keys stay the same
 * across the live → persisted handover (`message.saved` swaps `live-…` items for `m-…` ones with
 * the same content), so streamed text and open groups are not remounted mid-animation.
 * Text keys hang off the last non-text item (`t-<anchor>-<n>`), groups off their first call.
 */
export function groupAgentTimeline(items: readonly AgentTimelineItem[]): AgentRenderItem[] {
  const out: AgentRenderItem[] = [];
  let group: { kind: 'toolGroup'; key: string; tools: AgentToolItemData[] } | null = null;
  let anchor = 'start';
  let texts = 0;
  for (const item of items) {
    if (item.kind === 'tool') {
      if (group) {
        group.tools.push(item.tool);
        continue;
      }
      group = { kind: 'toolGroup', key: `c-${item.tool.callId}`, tools: [item.tool] };
      out.push(group);
      anchor = group.key;
      texts = 0;
      continue;
    }
    // Live drafts keep whitespace-only text that the persisted copy drops.
    if (item.kind === 'assistantText' && !item.text.trim()) continue;
    group = null;
    if (item.kind === 'assistantText') {
      out.push({ ...item, key: `t-${anchor}-${texts++}` });
    } else if (item.kind === 'action') {
      const key = `a-${item.actionId}`;
      out.push({ ...item, key });
      anchor = key;
      texts = 0;
    } else {
      out.push(item);
      anchor = item.key;
      texts = 0;
    }
  }
  return out;
}
