import { useEffect, useRef, useCallback } from 'react';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';

export const useMessageReadTracking = () => {
  const { user } = useAuthStore();
  const readMessagesRef = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const markMessageAsRead = useCallback(async (messageId: string) => {
    if (readMessagesRef.current.has(messageId)) return;
    
    try {
      await chatApi.markMessageAsRead(messageId);
      readMessagesRef.current.add(messageId);
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute('data-message-id');
            const senderId = entry.target.getAttribute('data-sender-id');
            
            if (messageId && senderId && senderId !== user?.id) {
              markMessageAsRead(messageId);
            }
          }
        });
      },
      {
        threshold: 0.5,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [markMessageAsRead, user?.id]);

  const observeMessage = useCallback((element: HTMLElement, messageId: string, senderId: string) => {
    if (observerRef.current && !readMessagesRef.current.has(messageId)) {
      element.setAttribute('data-message-id', messageId);
      element.setAttribute('data-sender-id', senderId);
      observerRef.current.observe(element);
    }
  }, []);

  const unobserveMessage = useCallback((element: HTMLElement) => {
    if (observerRef.current) {
      observerRef.current.unobserve(element);
    }
  }, []);

  return {
    observeMessage,
    unobserveMessage
  };
};
