// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getTranslations: vi.fn(), submitTranslations: vi.fn(), retryTranslations: vi.fn() }));
vi.mock('@/api/faq', () => ({ faqApi: api }));
vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: vi.fn() }));
vi.mock('@/utils/networkStatus', () => ({ useNetworkStore: (select: (state: { isOnline: boolean }) => boolean) => select({ isOnline: true }) }));
vi.mock('react-i18next', () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});

import { FaqTranslationsModal } from './FaqTranslationsModal';

const status = {
  generationEnabled: true,
  selectedLocales: ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'],
  sourceLocaleOverride: null,
  snapshot: 'snapshot-1',
  faqCount: 2,
  locales: ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'].map((locale) => ({ locale, ready: 0, pending: 0, failed: 0, stale: 0, missing: 2 })),
};

describe('FaqTranslationsModal', () => {
  let root: Root;
  let host: HTMLDivElement;
  const onClose = vi.fn();

  beforeEach(() => {
    api.getTranslations.mockReset();
    api.submitTranslations.mockReset();
    api.retryTranslations.mockReset();
    api.getTranslations.mockResolvedValue({ data: status });
    api.submitTranslations.mockResolvedValue({ data: status });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('loads all eleven saved targets and excludes an explicit source from submission', async () => {
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    expect(document.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(11);
    expect(api.submitTranslations).not.toHaveBeenCalled();

    const source = document.getElementById('faq-translation-source') as HTMLSelectElement;
    await act(async () => {
      source.value = 'en';
      source.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(10);
    expect(document.body.textContent).toContain('faq.translation.sourceCountsHint');
    expect(document.body.textContent).not.toContain('faq.translation.status.missing');

    const submit = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('faq.translation.translateTo'));
    expect(submit).toBeDefined();
    await act(async () => submit!.click());
    expect(api.submitTranslations).toHaveBeenCalledWith('game-1', {
      targetLocales: ['ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'],
      sourceLocaleOverride: 'en',
      expectedSnapshot: 'snapshot-1',
    });
  });

  it('does not submit on Escape and restores focus when closed', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open={false} onClose={onClose} />));
    expect(document.activeElement).toBe(opener);
    expect(api.submitTranslations).not.toHaveBeenCalled();
    opener.remove();
  });

  it('retries only when the failed status matches the selected source', async () => {
    api.getTranslations.mockResolvedValueOnce({ data: {
      ...status,
      locales: status.locales.map((row) => row.locale === 'ru' ? { ...row, failed: 1, missing: 1 } : row),
    } });
    api.retryTranslations.mockResolvedValue({ data: status });
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    const retry = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('faq.translation.retryFailed')) as HTMLButtonElement;
    expect(retry).toBeDefined();
    await act(async () => retry.click());
    expect(api.retryTranslations).toHaveBeenCalledWith('game-1', {
      targetLocales: status.selectedLocales,
      sourceLocaleOverride: null,
      expectedSnapshot: 'snapshot-1',
    });
  });

  it('announces completed selected translations instead of ongoing background work', async () => {
    api.getTranslations.mockResolvedValueOnce({ data: {
      ...status,
      selectedLocales: ['es'],
      locales: status.locales.map(row => row.locale === 'es' ? { ...row, ready: status.faqCount, missing: 0 } : row),
    } });
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    expect(document.body.textContent).toContain('faq.translation.completed');
    expect(document.body.textContent).not.toContain('faq.translation.background');
  });

  it('does not let a late status GET overwrite accepted submission', async () => {
    let finishGet!: (value: { data: typeof status }) => void;
    api.getTranslations
      .mockResolvedValueOnce({ data: status })
      .mockImplementationOnce(() => new Promise((resolve) => { finishGet = resolve; }));
    api.submitTranslations.mockResolvedValueOnce({ data: { ...status, snapshot: 'snapshot-2', generationEnabled: false } });
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    await act(async () => window.dispatchEvent(new Event('focus')));
    const submit = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('faq.translation.translateTo')) as HTMLButtonElement;
    await act(async () => submit.click());
    await act(async () => finishGet({ data: status }));
    expect(document.body.textContent).toContain('faq.translation.unavailable');
  });

  it('recovers when an old submission finishes during the reopened initial read', async () => {
    let finishPost!: (value: { data: typeof status }) => void;
    let finishReopen!: (value: { data: typeof status }) => void;
    api.getTranslations.mockResolvedValueOnce({ data: status })
      .mockImplementationOnce(() => new Promise(resolve => { finishReopen = resolve; }))
      .mockResolvedValueOnce({ data: status });
    api.submitTranslations.mockImplementationOnce(() => new Promise(resolve => { finishPost = resolve; }));
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    const submit = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('faq.translation.translateTo')) as HTMLButtonElement;
    await act(async () => submit.click());
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open={false} onClose={onClose} />));
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    await act(async () => finishPost({ data: status }));
    await act(async () => finishReopen({ data: status }));
    expect(document.getElementById('faq-translation-source')).not.toBeNull();
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(11);
    expect(document.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(11);
    expect(document.body.textContent).not.toContain('app.loading');
  });

  it.each([
    { editReopenedDraft: false, expectedSource: 'en' },
    { editReopenedDraft: true, expectedSource: 'ru' },
  ])('reconciles an old submission after reopen while respecting a changed draft: $editReopenedDraft', async ({ editReopenedDraft, expectedSource }) => {
    let finishPost!: (value: unknown) => void;
    const accepted = { ...status, selectedLocales: status.selectedLocales.filter(locale => locale !== 'en'), sourceLocaleOverride: 'en' };
    api.getTranslations.mockResolvedValueOnce({ data: status })
      .mockResolvedValueOnce({ data: status })
      .mockResolvedValueOnce({ data: accepted });
    api.submitTranslations.mockImplementationOnce(() => new Promise(resolve => { finishPost = resolve; }));

    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    const firstSource = document.getElementById('faq-translation-source') as HTMLSelectElement;
    await act(async () => {
      firstSource.value = 'en';
      firstSource.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const submit = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('faq.translation.translateTo')) as HTMLButtonElement;
    await act(async () => submit.click());
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open={false} onClose={onClose} />));
    await act(async () => root.render(<FaqTranslationsModal gameId="game-1" open onClose={onClose} />));
    const reopenedSource = document.getElementById('faq-translation-source') as HTMLSelectElement;
    expect(reopenedSource.value).toBe('');
    if (editReopenedDraft) {
      await act(async () => {
        reopenedSource.value = 'ru';
        reopenedSource.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    await act(async () => finishPost({ data: accepted }));
    expect((document.getElementById('faq-translation-source') as HTMLSelectElement).value).toBe(expectedSource);
    expect(document.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(10);
  });
});
