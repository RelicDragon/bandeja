import { useContext } from 'react';
import { MessageListSettlingContext, type MessageListSettlingRefs } from './messageListSettlingContext';

export function useMessageListSettlingRefs(): MessageListSettlingRefs {
  const ctx = useContext(MessageListSettlingContext);
  if (!ctx) {
    throw new Error('useMessageListSettlingRefs must be used within MessageListSettlingProvider');
  }
  return ctx;
}

export function useLayoutSettlingForRow(): {
  skipStaggerOnOpen: boolean;
  suppressOpenReactionMotion: boolean;
} {
  const { layoutSettlingRef, isInitialLoadRef } = useMessageListSettlingRefs();
  const layoutSettling = layoutSettlingRef.current ?? false;
  const isInitialLoad = isInitialLoadRef.current ?? false;
  return {
    skipStaggerOnOpen: layoutSettling || isInitialLoad,
    suppressOpenReactionMotion: layoutSettling,
  };
}
