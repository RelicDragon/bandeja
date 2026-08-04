import { useEffect, useState } from 'react';
import { onBooktimeReconnectRequired } from '@/integrations/booktime/session';

/** Club-scoped: surface "reconnect needed" for this club UI after auth invalidation. Toast is global. */
export function useBooktimeReconnectPrompt(clubId: string | undefined, enabled: boolean) {
  const [reconnectRequired, setReconnectRequired] = useState(false);

  useEffect(() => {
    if (!clubId || !enabled) return;
    return onBooktimeReconnectRequired(clubId, () => {
      setReconnectRequired(true);
    });
  }, [clubId, enabled]);

  const clearReconnectRequired = () => setReconnectRequired(false);

  return { reconnectRequired, clearReconnectRequired };
}
