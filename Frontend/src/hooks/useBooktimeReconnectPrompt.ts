import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { onBooktimeReconnectRequired } from '@/integrations/booktime/session';

export function useBooktimeReconnectPrompt(clubId: string | undefined, enabled: boolean) {
  const { t } = useTranslation();
  const [reconnectRequired, setReconnectRequired] = useState(false);

  useEffect(() => {
    if (!clubId || !enabled) return;
    return onBooktimeReconnectRequired(clubId, () => {
      setReconnectRequired(true);
      toast(t('club.booktime.sessionExpiredReconnect'), { icon: '🔐' });
    });
  }, [clubId, enabled, t]);

  const clearReconnectRequired = () => setReconnectRequired(false);

  return { reconnectRequired, clearReconnectRequired };
}
