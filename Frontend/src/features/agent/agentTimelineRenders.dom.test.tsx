// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRenderItem } from './agentTimeline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const parsed = vi.hoisted(() => [] as string[]);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/utils/haptics', () => ({ hapticSelection: () => {} }));
// Each markdown block "parse" is one render of this stub.
vi.mock('@/components/agent/AgentMarkdown', async () => {
  const { memo } = await import('react');
  return {
    AgentMarkdown: memo(function AgentMarkdownStub({ text }: { text: string }) {
      parsed.push(text);
      return <p>{text}</p>;
    }),
  };
});
vi.mock('@/components/agent/AgentToolGroup', () => ({ AgentToolGroup: () => null }));
vi.mock('@/components/agent/AgentActionCard', () => ({ AgentActionCard: () => null }));
vi.mock('@/components/agent/AgentClientActionCard', () => ({ AgentClientActionCard: () => null }));

const { AgentTimelineItem } = await import('@/components/agent/AgentTimelineItem');

const handlers = {
  startEdit: vi.fn(),
  cancelEdit: vi.fn(),
  submitEdit: vi.fn(),
  regenerate: vi.fn(),
  feedback: vi.fn(),
  confirm: vi.fn(),
  reject: vi.fn(),
  alwaysAllow: vi.fn(),
  runClientAction: vi.fn(),
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  parsed.length = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** A fresh timeline object graph every call, like `buildAgentTimeline` on each streamed chunk. */
function timeline(streamed: string): AgentRenderItem[] {
  const items: AgentRenderItem[] = [];
  for (let i = 0; i < 30; i++) {
    items.push({ kind: 'user', key: `u${i}`, messageId: `u${i}`, seq: i * 2, text: `Question ${i}` });
    items.push({ kind: 'assistantText', key: `a${i}`, text: `Answer ${i}.\n\nSecond paragraph ${i}.`, streaming: false, messageId: `a${i}` });
  }
  items.push({ kind: 'assistantText', key: 'live', text: streamed, streaming: false });
  return items;
}

function List({ items }: { items: AgentRenderItem[] }) {
  return (
    <>
      {items.map((item) => (
        <AgentTimelineItem
          key={item.key}
          item={item}
          handlers={handlers}
          editing={false}
          editBlocked={false}
          replyText={undefined}
          animate={false}
          canRegenerate={false}
          feedback={null}
          busy={null}
        />
      ))}
    </>
  );
}

describe('timeline render cost while streaming', () => {
  it('a growing reply re-parses only its last markdown block; settled rows do not re-render', () => {
    act(() => root.render(<List items={timeline('Intro paragraph.\n\nGrow')} />));
    // 30 settled replies × 2 blocks + the live reply's 2 blocks.
    expect(parsed.length).toBe(62);

    parsed.length = 0;
    act(() => root.render(<List items={timeline('Intro paragraph.\n\nGrowing')} />));
    expect(parsed).toEqual(['Growing']);

    parsed.length = 0;
    act(() => root.render(<List items={timeline('Intro paragraph.\n\nGrowing.\n\nNew block')} />));
    expect(parsed).toEqual(['Growing.', 'New block']);
  });
});
