import { useState, useEffect, useRef, useCallback } from 'react';

export const useOfflineMessage = (serverProblem: boolean) => {
  const [showOfflineMessage, setShowOfflineMessage] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startHideTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setShowOfflineMessage(false);
      timeoutRef.current = null;
    }, 12000);
  }, []);

  const toggleMessage = useCallback(() => {
    if (showOfflineMessage) {
      setShowOfflineMessage(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      setShowOfflineMessage(true);
      startHideTimeout();
    }
  }, [showOfflineMessage, startHideTimeout]);

  useEffect(() => {
    if (serverProblem) {
      setShowOfflineMessage(true);
      startHideTimeout();
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    } else {
      setShowOfflineMessage(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [serverProblem, startHideTimeout]);

  return {
    showOfflineMessage,
    toggleMessage,
    startHideTimeout,
  };
};

