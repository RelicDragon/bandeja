import { describe, expect, it } from 'vitest';
import { groupAgentTimeline, type AgentTimelineItem, type AgentToolItemData } from './agentTimeline';

const tool = (callId: string, status: AgentToolItemData['status'] = 'ok'): AgentToolItemData => ({
  callId,
  label: `label ${callId}`,
  status,
  summary: null,
  entities: [],
});

describe('groupAgentTimeline', () => {
  it('folds consecutive tool steps into one group and splits on text', () => {
    const items: AgentTimelineItem[] = [
      { kind: 'user', key: 'm-u1', messageId: 'u1', seq: 1, text: 'hi' },
      { kind: 'tool', key: 'm-a-0', tool: tool('c1') },
      { kind: 'tool', key: 'live-r-0', tool: tool('c2', 'running') },
      { kind: 'assistantText', key: 'live-r-1', text: 'Done', streaming: true },
      { kind: 'tool', key: 'live-r-2', tool: tool('c3') },
    ];
    const out = groupAgentTimeline(items);
    expect(out.map((i) => i.kind)).toEqual(['user', 'toolGroup', 'assistantText', 'toolGroup']);
    const first = out[1];
    expect(first.kind === 'toolGroup' && first.tools.map((t) => t.callId)).toEqual(['c1', 'c2']);
  });

  it('keeps keys stable across the live → persisted handover', () => {
    const live: AgentTimelineItem[] = [
      { kind: 'user', key: 'm-u1', messageId: 'u1', seq: 1, text: 'hi' },
      { kind: 'tool', key: 'live-r-0', tool: tool('c1') },
      { kind: 'assistantText', key: 'live-r-1', text: 'Hello', streaming: true },
    ];
    const persisted: AgentTimelineItem[] = [
      { kind: 'user', key: 'm-u1', messageId: 'u1', seq: 1, text: 'hi' },
      { kind: 'tool', key: 'm-a-0', tool: tool('c1') },
      { kind: 'assistantText', key: 'm-a-1', text: 'Hello', streaming: false },
    ];
    expect(groupAgentTimeline(live).map((i) => i.key)).toEqual(groupAgentTimeline(persisted).map((i) => i.key));
  });

  it('drops whitespace-only live text so it does not split a group', () => {
    const out = groupAgentTimeline([
      { kind: 'tool', key: 'a', tool: tool('c1') },
      { kind: 'assistantText', key: 'b', text: '\n', streaming: true },
      { kind: 'tool', key: 'c', tool: tool('c2') },
    ]);
    expect(out).toHaveLength(1);
  });
});
