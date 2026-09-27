// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getGameFaqs: vi.fn() }));
vi.mock('@/api/faq', () => ({ faqApi: api }));
vi.mock('@/components', () => ({ Card: ({ children }: { children: ReactNode }) => <div>{children}</div>, ConfirmationModal: () => null }));
vi.mock('@/components/ui/ExpandableTextarea', () => ({ ExpandableTextarea: () => null }));
vi.mock('./FaqTranslationsModal', () => ({ FaqTranslationsModal: () => null }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('react-i18next', () => { const t = (key: string) => key; return { useTranslation: () => ({ t }) }; });
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>, motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> } }));

import { FaqEdit } from './FaqEdit';

const faq = (gameId: string, question: string) => ({ id: `${gameId}-faq`, gameId, question, answer: 'Answer', order: 0, createdAt: '', updatedAt: '' });

describe('FaqEdit game switch', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    api.getGameFaqs.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('ignores a previous game’s FAQ response after the game changes', async () => {
    let resolveA!: (value: unknown) => void;
    api.getGameFaqs.mockImplementation((gameId: string) => gameId === 'A'
      ? new Promise((resolve) => { resolveA = resolve; })
      : Promise.resolve({ data: [faq('B', 'Question B')] }));
    await act(async () => root.render(<FaqEdit gameId="A" />));
    await act(async () => root.render(<FaqEdit gameId="B" />));
    const expand = host.querySelector('button[aria-label="faq.expand"]') as HTMLButtonElement;
    await act(async () => expand.click());
    expect(host.textContent).toContain('Question B');
    await act(async () => resolveA({ data: [faq('A', 'Question A')] }));
    expect(host.textContent).toContain('Question B');
    expect(host.textContent).not.toContain('Question A');
  });
});
