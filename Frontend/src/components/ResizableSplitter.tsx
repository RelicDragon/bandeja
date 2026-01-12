import { useState, useRef, useEffect, ReactNode } from 'react';

interface ResizableSplitterProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
}

export const ResizableSplitter = ({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 40,
  minLeftWidth = 300,
  maxLeftWidth = 600,
}: ResizableSplitterProps) => {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const splitterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidthPx = e.clientX - containerRect.left;
      
      const clampedWidthPx = Math.max(
        minLeftWidth,
        Math.min(maxLeftWidth, newLeftWidthPx)
      );
      
      const clampedWidthPercent = (clampedWidthPx / containerRect.width) * 100;
      setLeftWidth(clampedWidthPercent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minLeftWidth, maxLeftWidth]);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  return (
    <div ref={containerRef} className="flex h-full w-full relative">
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{ 
          width: `${leftWidth}%`,
          minWidth: `${minLeftWidth}px`,
          maxWidth: `${maxLeftWidth}px`
        }}
      >
        {leftPanel}
      </div>
      
      <div
        ref={splitterRef}
        onMouseDown={handleMouseDown}
        className={`w-0.5 bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors relative group ${
          isDragging ? 'bg-blue-500 dark:bg-blue-600' : ''
        }`}
        style={{ userSelect: 'none' }}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 group-hover:w-2 transition-all" />
      </div>
      
      <div className="flex-1 overflow-hidden min-w-0">
        {rightPanel}
      </div>
    </div>
  );
};
