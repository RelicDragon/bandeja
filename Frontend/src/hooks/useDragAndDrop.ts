import { useState } from 'react';

export const useDragAndDrop = (canEdit: boolean) => {
  const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

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
    setDraggedPlayer(null);
    setIsDragging(false);
    setTouchStartPos(null);
    setDragPosition(null);
  };

  const handleTouchStart = (e: TouchEvent, playerId: string) => {
    if (!canEdit) return;
    
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    setDraggedPlayer(playerId);
    setIsDragging(false);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!touchStartPos || !draggedPlayer) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.y);
    
    if (deltaX > 10 || deltaY > 10) {
      setIsDragging(true);
      setDragPosition({ x: touch.clientX, y: touch.clientY });
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: TouchEvent, onDrop: (matchId: string, team: 'teamA' | 'teamB', playerId: string) => void) => {
    if (!isDragging || !draggedPlayer) {
      setDraggedPlayer(null);
      setIsDragging(false);
      setTouchStartPos(null);
      setDragPosition(null);
      return;
    }

    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    if (element) {
      const dropZone = element.closest('[data-drop-zone]');
      if (dropZone) {
        const matchId = dropZone.getAttribute('data-match-id');
        const team = dropZone.getAttribute('data-team') as 'teamA' | 'teamB';
        
        if (matchId && team) {
          onDrop(matchId, team, draggedPlayer);
        }
      }
    }
    
    setDraggedPlayer(null);
    setIsDragging(false);
    setTouchStartPos(null);
    setDragPosition(null);
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

