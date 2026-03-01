import { useState, useEffect } from 'react';
import { isCapacitor } from '@/utils/capacitor';

export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!isCapacitor()) return;

    const updateKeyboardHeight = () => {
      const heightStr = getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height').trim();
      setKeyboardHeight(parseFloat(heightStr) || 0);
    };

    const observer = new MutationObserver(updateKeyboardHeight);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    updateKeyboardHeight();
    return () => observer.disconnect();
  }, []);

  return keyboardHeight;
}
