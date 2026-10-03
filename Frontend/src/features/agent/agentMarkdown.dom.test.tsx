// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentCodeLanguage, agentCodeText, agentLinkEntityKind, isAgentNumericCell } from './agentMarkdownElements';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
const share = vi.hoisted(() => ({ copyAgentMessageText: vi.fn(async () => true) }));
vi.mock('@/features/agent/agentMessageShare', () => share);
const external = vi.hoisted(() => ({ openExternalUrl: vi.fn(async () => {}) }));
vi.mock('@/utils/openExternalUrl', () => external);
vi.mock('@/components/agent/AgentInlineImage', () => ({ AgentInlineImage: () => null }));

const { AgentMarkdown } = await import('@/components/agent/AgentMarkdown');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  share.copyAgentMessageText.mockClear();
  external.openExternalUrl.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function render(node: ReactNode) {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/ai/c1']}>
        <Routes>
          <Route path="*" element={<>{node}<Where /></>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

const md = (text: string) => render(<AgentMarkdown text={text} />);

describe('AgentMarkdown', () => {
  it('renders fenced code with a language strip and copies the source', async () => {
    vi.useFakeTimers();
    md('Run:\n\n```ts\nconst a = 1;\nconsole.log(a);\n```');
    expect(container.querySelector('pre code')?.textContent).toBe('const a = 1;\nconsole.log(a);');
    expect(container.textContent).toContain('ts');
    const copy = container.querySelector('button[aria-label="agent.markdown.copyCode"]') as HTMLButtonElement;
    expect(copy).toBeTruthy();
    await act(async () => {
      copy.click();
    });
    expect(share.copyAgentMessageText).toHaveBeenCalledWith('const a = 1;\nconsole.log(a);');
    expect(container.querySelector('button[aria-label="common.copied"]')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(container.querySelector('button[aria-label="agent.markdown.copyCode"]')).toBeTruthy();
  });

  it('labels an unlabelled fence generically; inline code stays inline', () => {
    md('Use `npm ci`.\n\n```\nplain\n```');
    expect(container.textContent).toContain('agent.markdown.code');
    const inline = [...container.querySelectorAll('code')].find((c) => c.textContent === 'npm ci');
    expect(inline?.closest('pre')).toBeNull();
  });

  it('renders headings as real heading elements, scaled down', () => {
    md('# Big\n\n## Also big\n\n### Medium\n\n#### Small\n\n###### Tiny');
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Big', 'Also big']);
    expect(container.querySelector('h4')?.textContent).toBe('Medium');
    expect([...container.querySelectorAll('h5')].map((h) => h.textContent)).toEqual(['Small', 'Tiny']);
    expect(container.querySelector('h1, h2')).toBeNull();
  });

  it('wraps tables in a scroller, right-aligns numeric cells, honours explicit alignment', () => {
    md('| Player | Wins | Note |\n| --- | --- | :-: |\n| Ana | 12 | good |\n| Bo | 6-4 | ok |');
    const wrapper = container.querySelector('table')?.parentElement;
    expect(wrapper?.className).toContain('overflow-x-auto');
    expect(container.querySelector('thead')).toBeTruthy();
    const cells = [...container.querySelectorAll('tbody tr:first-child td')];
    expect(cells[0].className).toContain('text-start');
    expect(cells[1].className).toContain('text-end');
    expect(cells[2].className).toContain('text-center');
    expect(container.querySelector('tbody tr:last-child td:nth-child(2)')?.className).toContain('text-end');
  });

  it('renders in-app links as chips that navigate in the router', () => {
    md('See [Friday game](/games/g1) and [the club](https://bandeja.me/clubs/c9).');
    const chips = container.querySelectorAll('a[data-agent-link="internal"]');
    expect(chips).toHaveLength(2);
    expect(chips[0].querySelector('svg')).toBeTruthy();
    act(() => (chips[0] as HTMLAnchorElement).click());
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe('/games/g1');
    expect(external.openExternalUrl).not.toHaveBeenCalled();
  });

  it('opens external links outside the app with a glyph; blocks unsafe ones', () => {
    md('[Docs](https://example.com/x) and [bad](javascript:alert(1))');
    const link = container.querySelector('a[data-agent-link="external"]') as HTMLAnchorElement;
    expect(link.querySelector('svg')).toBeTruthy();
    act(() => link.click());
    expect(external.openExternalUrl).toHaveBeenCalledWith('https://example.com/x');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.textContent).toContain('bad');
  });

  it('styles blockquotes, rules and task lists', () => {
    md('> quoted\n\n---\n\n- [x] done\n- [ ] todo');
    expect(container.querySelector('blockquote')?.textContent).toContain('quoted');
    expect(container.querySelector('hr')).toBeTruthy();
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([
      [true, true],
      [false, true],
    ]);
    expect(container.querySelector('ul')?.className).toContain('list-none');
  });
});

describe('agentMarkdownElements', () => {
  it('reads the fence language and source', () => {
    const pre = {
      type: 'element',
      tagName: 'pre',
      children: [
        { type: 'element', tagName: 'code', properties: { className: ['language-json'] }, children: [{ type: 'text', value: '{}\n' }] },
      ],
    };
    expect(agentCodeLanguage(pre)).toBe('json');
    expect(agentCodeText(pre)).toBe('{}');
    expect(agentCodeLanguage({ type: 'element', tagName: 'pre', children: [] })).toBeNull();
  });

  it('detects numeric-looking cells', () => {
    for (const v of ['12', '-3.5', '€40', '6-4', '18:30', '75 %', '1 200,50']) expect(isAgentNumericCell(v)).toBe(true);
    for (const v of ['', 'Ana', '12 games', 'v2 beta']) expect(isAgentNumericCell(v)).toBe(false);
  });

  it('maps in-app paths to an entity kind', () => {
    expect(agentLinkEntityKind('/games/g1?tab=chat')).toBe('game');
    expect(agentLinkEntityKind('/clubs/c1')).toBe('club');
    expect(agentLinkEntityKind('/user-profile/u1')).toBe('player');
    expect(agentLinkEntityKind('/group-chat/x')).toBe('chat');
    expect(agentLinkEntityKind('/find')).toBe('other');
    expect(agentLinkEntityKind('/games')).toBe('other');
  });
});
