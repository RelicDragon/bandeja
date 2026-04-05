import { useCallback, useEffect, useRef, useState } from 'react';

export function useMessageInputMultiline(message: string, selectedImagesLength: number) {
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [, setIsMultiline] = useState(false);

  const updateMultilineState = useCallback(() => {
    requestAnimationFrame(() => {
      if (!inputContainerRef.current) return;
      const textarea = inputContainerRef.current.querySelector('textarea');
      if (!textarea) return;
      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = parseFloat(computedStyle.lineHeight);

      if (lineHeight && lineHeight > 0) {
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
        const scrollHeight = textarea.scrollHeight;
        const contentHeight = scrollHeight - paddingTop - paddingBottom;
        const rowCount = Math.ceil(contentHeight / lineHeight);
        setIsMultiline(rowCount > 2);
      } else {
        const fontSize = parseFloat(computedStyle.fontSize) || 14;
        const estimatedLineHeight = fontSize * 1.5;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
        const scrollHeight = textarea.scrollHeight;
        const contentHeight = scrollHeight - paddingTop - paddingBottom;
        const rowCount = Math.ceil(contentHeight / estimatedLineHeight);
        setIsMultiline(rowCount > 2);
      }
    });
  }, []);

  useEffect(() => {
    updateMultilineState();
  }, [message, selectedImagesLength, updateMultilineState]);

  useEffect(() => {
    if (!inputContainerRef.current) return;
    const textarea = inputContainerRef.current.querySelector('textarea');
    if (!textarea) return;
    const resizeObserver = new ResizeObserver(() => {
      updateMultilineState();
    });
    resizeObserver.observe(textarea);
    return () => resizeObserver.disconnect();
  }, [updateMultilineState]);

  return { inputContainerRef, updateMultilineState };
}
