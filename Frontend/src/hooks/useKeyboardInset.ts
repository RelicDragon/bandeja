import { useSyncExternalStore } from 'react';
import {
  getKeyboardState,
  subscribeKeyboardState,
  type KeyboardState,
} from '@/utils/keyboardState';

export function useKeyboardInset(): KeyboardState {
  return useSyncExternalStore(subscribeKeyboardState, getKeyboardState, getKeyboardState);
}
