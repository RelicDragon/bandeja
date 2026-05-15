import { createContext, useContext } from 'react';

export const ChatAutoTranslateContext = createContext<string[]>([]);

export function useChatAutoTranslateSlots(): string[] {
  return useContext(ChatAutoTranslateContext);
}
