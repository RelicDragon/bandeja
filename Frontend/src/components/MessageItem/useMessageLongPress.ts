import { useEffect, useRef, RefObject } from 'react';

interface UseMessageLongPressArgs {
  messageRef: RefObject<HTMLDivElement | null>;
  messageId: string;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  isOffline: boolean;
}

export function useMessageLongPress({
  messageRef,
  messageId,
  onOpenContextMenu,
  isOffline,
}: UseMessageLongPressArgs): void {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const messageElement = messageRef.current;
    if (!messageElement) return;

    const messageBubble = messageElement.querySelector('[data-message-bubble="true"]') as HTMLElement;
    const reactionButton = messageElement.querySelector('[data-reaction-button="true"]') as HTMLElement;

    if (!messageBubble) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let menuWasOpened = false;
    const scrollThreshold = 10;

    const clearTimer = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const stopEventIfMenuOpened = (e: Event) => {
      if (menuWasOpened) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const preventContextMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const me = e as MouseEvent;
      if (me.button === 2 && !isOffline) {
        onOpenContextMenu(messageId, { x: me.clientX, y: me.clientY });
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      menuWasOpened = false;
      const clientX = e.clientX;
      const clientY = e.clientY;

      longPressTimer.current = setTimeout(() => {
        if (isOffline) return;
        menuWasOpened = true;
        onOpenContextMenu(messageId, { x: clientX, y: clientY });
      }, 500);
    };

    const handleMouseUp = (e: MouseEvent) => {
      clearTimer();
      stopEventIfMenuOpened(e);
    };

    const handleClick = (e: MouseEvent) => {
      if (menuWasOpened) {
        stopEventIfMenuOpened(e);
        menuWasOpened = false;
      }
    };

    const handleMouseLeave = () => {
      clearTimer();
    };

    const handleTouchStart = (e: TouchEvent) => {
      menuWasOpened = false;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;

      longPressTimer.current = setTimeout(() => {
        if (isOffline) return;
        menuWasOpened = true;
        onOpenContextMenu(messageId, { x: clientX, y: clientY });
      }, 500);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!longPressTimer.current) return;

      const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY);

      if (deltaX > scrollThreshold || deltaY > scrollThreshold) {
        clearTimer();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      clearTimer();
      stopEventIfMenuOpened(e);
    };

    const handleTouchCancel = () => {
      clearTimer();
    };

    const eventConfigs = [
      { event: 'mousedown', handler: handleMouseDown, options: { passive: true } },
      { event: 'mouseup', handler: handleMouseUp, options: { passive: false, capture: true } },
      { event: 'click', handler: handleClick, options: { passive: false, capture: true } },
      { event: 'mouseleave', handler: handleMouseLeave, options: { passive: true } },
      { event: 'touchstart', handler: handleTouchStart, options: { passive: true } },
      { event: 'touchmove', handler: handleTouchMove, options: { passive: true } },
      { event: 'touchend', handler: handleTouchEnd, options: { passive: false, capture: true } },
      { event: 'touchcancel', handler: handleTouchCancel, options: { passive: true } },
    ];

    const attachListeners = (element: HTMLElement) => {
      eventConfigs.forEach(({ event, handler, options }) => {
        element.addEventListener(event, handler as EventListener, options);
      });
    };

    const detachListeners = (element: HTMLElement) => {
      eventConfigs.forEach(({ event, handler, options }) => {
        element.removeEventListener(event, handler as EventListener, options);
      });
    };

    messageElement.addEventListener('contextmenu', preventContextMenu, { passive: false });
    attachListeners(messageBubble);
    if (reactionButton) {
      attachListeners(reactionButton);
    }

    return () => {
      messageElement.removeEventListener('contextmenu', preventContextMenu);
      detachListeners(messageBubble);
      if (reactionButton) {
        detachListeners(reactionButton);
      }
    };
  }, [messageRef, messageId, onOpenContextMenu, isOffline]);
}
