// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramSummaryModal } from './TelegramSummaryModal';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: vi.fn() }));
vi.mock('@/api/games', () => ({ gamesApi: { prepareTelegramSummary: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const expandButton = () =>
  document.querySelector<HTMLButtonElement>('[data-testid="expand-textarea"]');
const editor = () => document.querySelector<HTMLElement>('[data-testid="fullscreen-text-editor"]');
const editorTextarea = () => editor()?.querySelector<HTMLTextAreaElement>('textarea') ?? null;
const modalTextarea = () =>
  document.querySelector<HTMLTextAreaElement>('[aria-labelledby="telegram-summary-title"] textarea');

const typeInto = async (textarea: HTMLTextAreaElement, value: string) => {
  // React dedupes via its value tracker, so write through the native setter.
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, value);
  await act(async () => textarea.dispatchEvent(new Event('input', { bubbles: true })));
};

describe('TelegramSummaryModal fullscreen editing', () => {
  let root: Root;
  let host: HTMLDivElement;
  let onClose: ReturnType<typeof vi.fn>;
  let onSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    onClose = vi.fn();
    onSend = vi.fn().mockResolvedValue(undefined);
    await act(async () =>
      root.render(
        <TelegramSummaryModal
          isOpen
          onClose={onClose}
          gameId="g1"
          initialSummary="Results: A beat B"
          onSend={onSend}
        />,
      ),
    );
    await act(async () => vi.runAllTimers());
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('offers the fullscreen control on the summary field', () => {
    expect(modalTextarea()!.value).toBe('Results: A beat B');
    expect(expandButton()).not.toBeNull();
  });

  it('edits the summary live from the fullscreen editor', async () => {
    await act(async () => expandButton()!.click());
    expect(editorTextarea()!.value).toBe('Results: A beat B');

    await typeInto(editorTextarea()!, 'Results: A beat B 6-4 6-3');

    expect(modalTextarea()!.value).toBe('Results: A beat B 6-4 6-3');
  });

  it('Escape closes only the fullscreen editor, not the Telegram modal', async () => {
    await act(async () => expandButton()!.click());
    expect(editor()).not.toBeNull();

    await act(async () => {
      // Real key events are cancelable; Radix marks the one it consumes via preventDefault.
      editorTextarea()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    await act(async () => vi.runAllTimers());

    expect(editor()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(modalTextarea());
  });

  it('a bare Escape still cancels the modal', async () => {
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Done keeps the modal open and sends the edited text', async () => {
    await act(async () => expandButton()!.click());
    await typeInto(editorTextarea()!, 'Edited in fullscreen');
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="fullscreen-text-editor-done"]')!.click(),
    );

    expect(editor()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    const send = [...document.querySelectorAll<HTMLButtonElement>('footer button')].find((b) =>
      b.textContent?.includes('gameResults.send'),
    )!;
    await act(async () => send.click());

    expect(onSend).toHaveBeenCalledWith('Edited in fullscreen');
  });
});
