import { useCallback, useEffect, useState } from 'react';
import { chatApi, type MessageDetails } from '@/api/chat';

type DetailsState = {
  messageId: string;
  status: 'loading' | 'ready' | 'error';
  data?: MessageDetails;
};

export function useMessageDetails(messageId: string, open: boolean) {
  const [state, setState] = useState<DetailsState>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ messageId, status: 'loading' });
    void chatApi.getMessageDetails(messageId).then(
      data => {
        if (!cancelled) setState({ messageId, status: 'ready', data });
      },
      () => {
        if (!cancelled) setState({ messageId, status: 'error' });
      }
    );
    return () => { cancelled = true; };
  }, [messageId, open, attempt]);

  return {
    status: state?.messageId === messageId ? state.status : 'loading',
    data: state?.messageId === messageId ? state.data : undefined,
    retry,
  };
}
