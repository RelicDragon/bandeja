import { useState, useCallback, useRef, useEffect } from 'react';

interface ContextMenuState {
  isOpen: boolean;
  messageId: string | null;
  position: { x: number; y: number };
}

export const useContextMenuManager = () => {
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    isOpen: false,
    messageId: null,
    position: { x: 0, y: 0 }
  });
  
  const scrollTimeoutRef = useRef<number | null>(null);
  const isScrollingRef = useRef(false);

  const openContextMenu = useCallback((messageId: string, position: { x: number; y: number }) => {
    if (isScrollingRef.current) {
      return;
    }
    
    setContextMenuState({
      isOpen: true,
      messageId,
      position
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuState(prev => ({
      ...prev,
      isOpen: false,
      messageId: null
    }));
  }, []);

  const handleScrollStart = useCallback(() => {
    isScrollingRef.current = true;
    closeContextMenu();
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 150);
  }, [closeContextMenu]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    contextMenuState,
    openContextMenu,
    closeContextMenu,
    handleScrollStart,
    isScrolling: isScrollingRef.current
  };
};
