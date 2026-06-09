import { createContext, type RefObject } from 'react';

export type MessageListSettlingRefs = {
  layoutSettlingRef: RefObject<boolean>;
  isInitialLoadRef: RefObject<boolean>;
};

export const MessageListSettlingContext = createContext<MessageListSettlingRefs | null>(null);
