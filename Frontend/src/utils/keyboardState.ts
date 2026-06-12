import { shouldShiftDialogForKeyboard } from './keyboardLayout';

export type KeyboardState = {
  visible: boolean;
  insetPx: number;
};

let state: KeyboardState = { visible: false, insetPx: 0 };
const listeners = new Set<() => void>();

/* Single DOM writer: every keyboard-driven CSS hook in the app
   (--keyboard-height, keyboard-visible, keyboard-dialog-shift) is owned here. */
const applyKeyboardStateToDom = (next: KeyboardState) => {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.style.setProperty('--keyboard-height', `${next.insetPx}px`);
  document.body.classList.toggle('keyboard-visible', next.visible);
  document.body.classList.toggle(
    'keyboard-dialog-shift',
    shouldShiftDialogForKeyboard(next.insetPx, next.visible),
  );
};

export const getKeyboardState = (): KeyboardState => state;

export const subscribeKeyboardState = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const publishKeyboardState = (next: KeyboardState) => {
  applyKeyboardStateToDom(next);
  if (next.visible === state.visible && next.insetPx === state.insetPx) return;
  state = next;
  listeners.forEach((listener) => listener());
};
