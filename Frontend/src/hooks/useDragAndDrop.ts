import { useRef, useState } from 'react';

const TOUCH_DRAG_THRESHOLD_PX = 10;

export const useDragAndDrop = (canEdit: boolean) => {
  const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  // A touch only becomes a drag once it moves; until then it may still be a tap-to-place.
  const touchRef = useRef<{ x: number; y: number; playerId: string } | null>(null);
  // Native touch listeners can run before React re-renders, so track the drag in a ref too.
  const touchDraggingRef = useRef(false);

  const reset = () => {
    touchRef.current = null;
    touchDraggingRef.current = false;
    setDraggedPlayer(null);
    setIsDragging(false);
    setDragPosition(null);
  };

  const handleDragStart = (e: React.DragEvent, playerId: string) => {
    if (!canEdit) {
      e.preventDefault();
      return;
    }

    setDraggedPlayer(playerId);
    e.dataTransfer.effectAllowed = 'move';

    const dragImage = new Image();
    dragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
    e.dataTransfer.setDragImage(dragImage, 0, 0);

    setDragPosition({ x: e.clientX, y: e.clientY });
  };

  const handleDragEnd = () => {
    reset();
  };

  const handleTouchStart = (e: TouchEvent, playerId: string) => {
    if (!canEdit) return;

    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY, playerId };
  };

  const handleTouchMove = (e: TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);

    if (!touchDraggingRef.current && deltaX > TOUCH_DRAG_THRESHOLD_PX && deltaX >= deltaY) {
      // Sideways swipe: the player tray is scrolling, not a drag.
      touchRef.current = null;
      return;
    }

    if (touchDraggingRef.current || deltaY > TOUCH_DRAG_THRESHOLD_PX) {
      if (!touchDraggingRef.current) {
        touchDraggingRef.current = true;
        setDraggedPlayer(start.playerId);
        setIsDragging(true);
      }
      setDragPosition({ x: touch.clientX, y: touch.clientY });
      e.preventDefault();
    }
  };

  /** Returns whether the touch was a drag (so the caller can ignore the follow-up click). */
  const handleTouchEnd = (e: TouchEvent, onDrop: (matchId: string, team: 'teamA' | 'teamB', playerId: string) => void): boolean => {
    const start = touchRef.current;
    if (!touchDraggingRef.current || !start) {
      reset();
      return false;
    }

    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);

    if (element) {
      const dropZone = element.closest('[data-drop-zone]');
      if (dropZone) {
        const matchId = dropZone.getAttribute('data-match-id');
        const team = dropZone.getAttribute('data-team') as 'teamA' | 'teamB';

        if (matchId && team) {
          onDrop(matchId, team, start.playerId);
        }
      }
    }

    reset();
    return true;
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragPosition({ x: e.clientX, y: e.clientY });
  };

  return {
    draggedPlayer,
    isDragging,
    dragPosition,
    handleDragStart,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleDragOver,
  };
};
