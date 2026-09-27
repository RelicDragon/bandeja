// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ getGameFaqs: vi.fn(), getTranslations: vi.fn(), requestReaderTranslation: vi.fn(), language: 'es', online: true }));
vi.mock('@/api/faq', () => ({ faqApi: mock }));
vi.mock('@/components', () => ({ Card: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/utils/networkStatus', () => ({ useNetworkStore: (select: (state: { isOnline: boolean }) => boolean) => select({ isOnline: mock.online }) }));
vi.mock('react-i18next', () => {
  const t = (key: string) => key;
  const getFixedT = (locale: string) => (key: string) => `${locale}:${key}`;
  return { useTranslation: () => ({ t, i18n: { resolvedLanguage: mock.language, language: mock.language, getFixedT } }) };
});

import { FaqTab } from './FaqTab';

const original = { id: 'faq-1', gameId: 'game-1', question: 'Original question', answer: 'Original answer', order: 0, createdAt: '', updatedAt: '' };
const localized = (locale: string, question: string, answer: string) => ({ ...original, localizedText: { locale, state: 'translated', question, answer } });
const status = (locale = 'es', values: Partial<{ ready: number; pending: number; failed: number; stale: number; missing: number }> = {}, generationEnabled = true) => ({
  generationEnabled, selectedLocales: ['es'], sourceLocaleOverride: null, snapshot: 'snapshot-1', faqCount: 1,
  locales: ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'].map((item) => ({ locale: item, ready: item === locale ? (values.ready ?? 0) : 0, pending: item === locale ? (values.pending ?? 0) : 0, failed: item === locale ? (values.failed ?? 0) : 0, stale: item === locale ? (values.stale ?? 0) : 0, missing: item === locale ? (values.missing ?? 0) : 1 })),
});
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function buttonWithText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}
async function selectLanguage(host: HTMLElement, locale: string) {
  const select = host.querySelector('select') as HTMLSelectElement;
  await act(async () => { select.value = locale; select.dispatchEvent(new Event('change', { bubbles: true })); });
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('FaqTab reader languages', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    mock.language = 'es';
    mock.online = true;
    mock.getGameFaqs.mockReset();
    mock.getTranslations.mockReset();
    mock.requestReaderTranslation.mockReset();
    mock.getGameFaqs.mockResolvedValue({ data: [localized('es', 'Pregunta traducida', 'Respuesta traducida')] });
    mock.getTranslations.mockResolvedValue({ data: status('es', { ready: 1, missing: 0 }) });
    mock.requestReaderTranslation.mockResolvedValue({ data: status('es', { pending: 1, missing: 0 }) });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => root.unmount());
    host.remove();
  });

  it('defaults to the app language, renders a complete translated pair, and offers per-pair and global originals', async () => {
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('es');
    expect(mock.getGameFaqs).toHaveBeenCalledWith('game-1', 'es');
    expect(host.textContent).toContain('Pregunta traducida');
    await act(async () => (host.querySelector('[aria-expanded]') as HTMLButtonElement).click());
    expect(host.textContent).toContain('Respuesta traducida');
    await act(async () => buttonWithText(host, 'faq.translation.showOriginal').click());
    expect(host.textContent).toContain('Original question');
    expect(host.textContent).toContain('Original answer');
    await selectLanguage(host, 'original');
    expect(host.textContent).toContain('Original question');
    expect(mock.requestReaderTranslation).not.toHaveBeenCalled();
  });

  it('keeps originals visible while a missing language queues, then polls and replaces the ready pair', async () => {
    let published = false;
    mock.getGameFaqs.mockImplementation(async (_id: string, locale: string) => ({ data: [published && locale === 'ar' ? localized('ar', 'سؤال مترجم', 'إجابة مترجمة') : original] }));
    mock.getTranslations.mockResolvedValueOnce({ data: status('es', { ready: 1, missing: 0 }) })
      .mockResolvedValueOnce({ data: status('ar', { missing: 1 }) })
      .mockImplementation(async () => ({ data: status('ar', { ready: 1, missing: 0 }) }));
    mock.requestReaderTranslation.mockResolvedValue({ data: status('ar', { pending: 1, missing: 0 }) });
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    vi.useFakeTimers();
    await selectLanguage(host, 'ar');
    expect(mock.requestReaderTranslation).toHaveBeenCalledWith('game-1', 'ar', false);
    expect(host.textContent).toContain('Original question');
    expect(host.textContent).toContain('faq.translation.readerTranslating');
    published = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(host.textContent).toContain('سؤال مترجم');
    expect(host.textContent).toContain('إجابة مترجمة');
    expect(host.textContent).not.toContain('faq.translation.readerTranslating');
  });

  it('shows failed work and retries only after the reader asks', async () => {
    mock.getGameFaqs.mockResolvedValue({ data: [original] });
    mock.getTranslations.mockResolvedValue({ data: status('es', { failed: 1, missing: 0 }) });
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect(mock.requestReaderTranslation).not.toHaveBeenCalled();
    expect(host.textContent).toContain('faq.translation.readerFailed');
    await act(async () => buttonWithText(host, 'faq.translation.readerRetry').click());
    expect(mock.requestReaderTranslation).toHaveBeenCalledWith('game-1', 'es', true);
  });

  it('does not auto-submit repeatedly after a failed request, but offers manual retry', async () => {
    mock.getGameFaqs.mockResolvedValue({ data: [original] });
    mock.getTranslations.mockResolvedValue({ data: status('es', { missing: 1 }) });
    mock.requestReaderTranslation.mockRejectedValue(new Error('busy'));
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect(mock.requestReaderTranslation).toHaveBeenCalledTimes(1);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(mock.requestReaderTranslation).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('faq.translation.readerRequestError');
    await act(async () => buttonWithText(host, 'faq.translation.readerRetry').click());
    expect(mock.requestReaderTranslation).toHaveBeenCalledTimes(2);
  });

  it('allows an explicit language reselection to recover a failed request', async () => {
    mock.getGameFaqs.mockResolvedValue({ data: [original] });
    mock.getTranslations.mockResolvedValueOnce({ data: status('es', { missing: 1 }) })
      .mockResolvedValueOnce({ data: status('ar', { ready: 1, missing: 0 }) })
      .mockResolvedValueOnce({ data: status('es', { missing: 1 }) });
    mock.requestReaderTranslation.mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce({ data: status('es', { pending: 1, missing: 0 }) });
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect(mock.requestReaderTranslation).toHaveBeenCalledTimes(1);
    await selectLanguage(host, 'ar');
    await selectLanguage(host, 'es');
    expect(mock.requestReaderTranslation).toHaveBeenCalledTimes(2);
    expect(mock.requestReaderTranslation).toHaveBeenLastCalledWith('game-1', 'es', false);
  });

  it('allows an app-language change away and back to recover a failed request', async () => {
    mock.getGameFaqs.mockResolvedValue({ data: [original] });
    mock.getTranslations.mockResolvedValueOnce({ data: status('es', { missing: 1 }) })
      .mockResolvedValueOnce({ data: status('ar', { ready: 1, missing: 0 }) })
      .mockResolvedValueOnce({ data: status('es', { missing: 1 }) });
    mock.requestReaderTranslation.mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce({ data: status('es', { pending: 1, missing: 0 }) });
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect(mock.requestReaderTranslation).toHaveBeenCalledTimes(1);
    mock.language = 'ar';
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    mock.language = 'es';
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect(mock.requestReaderTranslation).toHaveBeenCalledTimes(2);
  });

  it('recovers from an initial FAQ read error and keeps the toolbar available', async () => {
    mock.getGameFaqs.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: [original] });
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect(host.textContent).toContain('faq.translation.readerLoadError');
    expect(host.querySelector('select')).not.toBeNull();
    await act(async () => buttonWithText(host, 'faq.translation.readerRefresh').click());
    expect(host.textContent).toContain('Original question');
  });

  it('ignores a late previous-locale response and keeps the expanded answer', async () => {
    const oldRead = deferred<{ data: (typeof original)[] }>();
    mock.getGameFaqs.mockImplementation((_id: string, locale: string) => locale === 'es' ? oldRead.promise : Promise.resolve({ data: [localized('ar', 'سؤال مترجم', 'إجابة مترجمة')] }));
    mock.getTranslations.mockResolvedValue({ data: status('ar', { ready: 1, missing: 0 }) });
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    await selectLanguage(host, 'ar');
    expect(host.textContent).toContain('سؤال مترجم');
    await act(async () => (host.querySelector('[aria-expanded]') as HTMLButtonElement).click());
    await act(async () => oldRead.resolve({ data: [localized('es', 'Stale Spanish', 'Stale answer')] }));
    expect(host.textContent).toContain('إجابة مترجمة');
    expect(host.textContent).not.toContain('Stale Spanish');
  });

  it('does not queue work for a locale abandoned during a slow partial-ready read', async () => {
    const slowReadyRead = deferred<{ data: (typeof original)[] }>();
    mock.getGameFaqs.mockResolvedValueOnce({ data: [original] })
      .mockImplementationOnce(() => slowReadyRead.promise)
      .mockResolvedValue({ data: [original] });
    mock.getTranslations.mockResolvedValueOnce({ data: status('es', { ready: 1, missing: 1 }) })
      .mockResolvedValueOnce({ data: status('ar', { ready: 1, missing: 0 }) });
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    await selectLanguage(host, 'ar');
    await act(async () => slowReadyRead.resolve({ data: [original] }));
    expect(mock.requestReaderTranslation).not.toHaveBeenCalledWith('game-1', 'es', false);
    expect(host.textContent).toContain('Original question');
  });

  it('hides the previous game immediately and ignores its late read', async () => {
    const slowA = deferred<{ data: (typeof original)[] }>();
    mock.getGameFaqs.mockImplementation((id: string) => id === 'A' ? slowA.promise : Promise.resolve({ data: [{ ...original, id: 'faq-B', gameId: 'B', question: 'Game B question' }] }));
    await act(async () => root.render(<FaqTab gameId="A" />));
    await act(async () => root.render(<FaqTab gameId="B" />));
    expect(host.textContent).toContain('Game B question');
    await act(async () => slowA.resolve({ data: [{ ...original, gameId: 'A', question: 'Game A question' }] }));
    expect(host.textContent).not.toContain('Game A question');
  });

  it('resumes missing translation on an offline-to-online transition', async () => {
    mock.online = false;
    mock.getGameFaqs.mockResolvedValue({ data: [original] });
    mock.getTranslations.mockResolvedValue({ data: status('es', { missing: 1 }) });
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect(mock.requestReaderTranslation).not.toHaveBeenCalled();
    mock.online = true;
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    expect(mock.requestReaderTranslation).toHaveBeenCalledWith('game-1', 'es', false);
  });

  it('renders the built-in standings FAQ in the selected language', async () => {
    mock.getGameFaqs.mockResolvedValue({ data: [] });
    await act(async () => root.render(<FaqTab gameId="game-1" includeFixedTeamStandingsFaq />));
    expect(host.textContent).toContain('es:faq.fixedTeamStandings.question');
    await selectLanguage(host, 'ar');
    expect(host.textContent).toContain('ar:faq.fixedTeamStandings.question');
  });

  it('ignores a late status read during an in-flight generation request', async () => {
    const pendingPost = deferred<{ data: ReturnType<typeof status> }>();
    mock.getGameFaqs.mockResolvedValue({ data: [original] });
    mock.getTranslations.mockResolvedValue({ data: status('es', { missing: 1 }) });
    mock.requestReaderTranslation.mockImplementation(() => pendingPost.promise);
    await act(async () => root.render(<FaqTab gameId="game-1" />));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(mock.getTranslations).toHaveBeenCalledTimes(1);
    await act(async () => pendingPost.resolve({ data: status('es', { ready: 1, missing: 0 }) }));
    expect(host.textContent).not.toContain('faq.translation.readerTranslating');
    expect(host.querySelector('.animate-spin')).toBeNull();
  });
});
