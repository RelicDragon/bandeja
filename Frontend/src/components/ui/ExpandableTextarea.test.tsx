// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpandableTextarea } from './ExpandableTextarea';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const editorCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../styles/keyboard/fullscreen-text-editor.css'),
  'utf8',
);

const expandButton = () =>
  document.querySelector<HTMLButtonElement>('[data-testid="expand-textarea"]');
const editor = () => document.querySelector<HTMLElement>('[data-testid="fullscreen-text-editor"]');
const editorTextarea = () =>
  editor()?.querySelector<HTMLTextAreaElement>('textarea') ?? null;
const doneButton = () =>
  document.querySelector<HTMLButtonElement>('[data-testid="fullscreen-text-editor-done"]');

describe('ExpandableTextarea', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  const render = async (props: Partial<Parameters<typeof ExpandableTextarea>[0]> = {}) =>
    act(async () =>
      root.render(
        <ExpandableTextarea
          value="hello"
          onValueChange={() => {}}
          fullscreenTitle="Description"
          {...props}
        />,
      ),
    );

  it('opens the fullscreen editor seeded with the current text', async () => {
    await render();
    expect(editor()).toBeNull();

    await act(async () => expandButton()!.click());

    expect(editor()).not.toBeNull();
    expect(editorTextarea()!.value).toBe('hello');
  });

  it('propagates edits live, so closing never discards text', async () => {
    const onValueChange = vi.fn();
    await render({ onValueChange });
    await act(async () => expandButton()!.click());

    const textarea = editorTextarea()!;
    // React dedupes via its value tracker, so write through the native setter.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      'hello world',
    );
    await act(async () => textarea.dispatchEvent(new Event('input', { bubbles: true })));

    expect(onValueChange).toHaveBeenCalledWith('hello world');
  });

  it('closes on Done', async () => {
    await render();
    await act(async () => expandButton()!.click());
    await act(async () => doneButton()!.click());

    expect(editor()).toBeNull();
  });

  it('hides the control when the field cannot be edited', async () => {
    await render({ disabled: true });
    expect(expandButton()).toBeNull();

    await render({ disabled: false, readOnly: true });
    expect(expandButton()).toBeNull();
  });

  it('reserves room so the control never sits on top of the first line', async () => {
    await render();
    const inline = host.querySelector('textarea')!;
    expect(inline.style.paddingInlineEnd).not.toBe('');
  });
});

describe('fullscreen text editor keyboard CSS', () => {
  it('pins the panel to the visual viewport instead of the layout viewport', () => {
    expect(editorCss).toContain(
      'html body.keyboard-visible .fullscreen-dialog-root.fullscreen-text-editor',
    );
    expect(editorCss).toContain('top: var(--vv-offset-top, 0px);');
    expect(editorCss).toContain('bottom: var(--overlay-bottom-inset, var(--keyboard-height, 0px));');
  });

  it('drops the generic body keyboard padding so the inset is not counted twice', () => {
    expect(editorCss).toContain('.cap-fullscreen-dialog-body.fullscreen-text-editor-body');
    expect(editorCss).toMatch(/fullscreen-text-editor-body\s*\{[^}]*padding-bottom:\s*0;/s);
  });

  it('animates open and closed', () => {
    expect(editorCss).toContain(".fullscreen-text-editor-animate[data-state='open']");
    expect(editorCss).toContain(".fullscreen-text-editor-animate[data-state='closed']");
    expect(editorCss).toContain('@keyframes fullscreen-text-editor-in');
    expect(editorCss).toContain('@keyframes fullscreen-text-editor-out');
    expect(editorCss).toContain('prefers-reduced-motion');
  });
});
