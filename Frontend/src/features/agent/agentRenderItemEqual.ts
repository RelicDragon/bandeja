import type { AgentRenderItem, AgentToolItemData } from './agentTimeline';

function sameTool(a: AgentToolItemData, b: AgentToolItemData): boolean {
  return (
    a === b ||
    (a.callId === b.callId &&
      a.label === b.label &&
      a.status === b.status &&
      a.summary === b.summary &&
      a.entities === b.entities &&
      a.memorySaved === b.memorySaved &&
      a.web === b.web &&
      a.images === b.images &&
      a.card === b.card)
  );
}

/**
 * Same content for rendering. `buildAgentTimeline` makes fresh item objects on every change
 * (each streamed chunk), but the nested data (entities, web, cards, actions) keeps its
 * references while unchanged, so a field-by-field check lets settled items skip re-rendering.
 */
export function sameAgentRenderItem(a: AgentRenderItem, b: AgentRenderItem): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind || a.key !== b.key) return false;
  switch (a.kind) {
    case 'user': {
      const o = b as typeof a;
      return a.text === o.text && a.messageId === o.messageId && a.seq === o.seq;
    }
    case 'assistantText': {
      const o = b as typeof a;
      return a.text === o.text && a.streaming === o.streaming && a.messageId === o.messageId;
    }
    case 'toolGroup': {
      const o = b as typeof a;
      return a.tools.length === o.tools.length && a.tools.every((tool, i) => sameTool(tool, o.tools[i]!));
    }
    case 'action': {
      const o = b as typeof a;
      return a.actionId === o.actionId && a.action === o.action;
    }
  }
}

/** The last reply that is still the newest turn's (no own message after it): Regenerate goes there. */
export function lastAgentReplyKey(
  timeline: readonly AgentRenderItem[],
  replyTextByKey: ReadonlyMap<string, string>,
): string | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i]!;
    if (item.kind === 'user') return null;
    if (item.kind === 'assistantText' && replyTextByKey.has(item.key)) return item.key;
  }
  return null;
}

/** The newest own message: what Retry / Regenerate resend (through the edit path). */
export function lastAgentUserItem(
  timeline: readonly AgentRenderItem[],
): Extract<AgentRenderItem, { kind: 'user' }> | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i]!;
    if (item.kind === 'user') return item;
  }
  return null;
}
