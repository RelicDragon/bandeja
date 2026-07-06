import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useChatOfflineStore } from '@/store/chatOfflineStore';
import { useChatSyncStore } from '@/store/chatSyncStore';
import './ChatConnectionActivityOverlay.css';

type OverlayVariant = 'syncing' | 'offline';

/**
 * Universal chat connection activity line — absolute bottom edge, pointer-events-none.
 */
export function ChatConnectionActivityOverlay() {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const connectionState = useChatOfflineStore((s) => s.chatConnectionState);
  const paint = useChatSyncStore((s) => s.lastThreadPaintSource);

  const active = connectionState === 'OFFLINE' || connectionState === 'SYNCING';
  const variant: OverlayVariant = connectionState === 'OFFLINE' ? 'offline' : 'syncing';

  const statusTitle = useMemo(
    () =>
      connectionState === 'OFFLINE'
        ? t('chat.offlineBanner', 'No connection — showing saved messages')
        : connectionState === 'SYNCING'
          ? t('chat.syncingBanner', 'Syncing…')
          : undefined,
    [connectionState, t]
  );

  const paintHint = useMemo(
    () =>
      paint === 'dexie'
        ? t('chat.statusPaintDexie', 'Opened from saved messages')
        : paint === 'network'
          ? t('chat.statusPaintNetwork', 'Loaded from server')
          : undefined,
    [paint, t]
  );

  const ariaLabel = paintHint && statusTitle ? `${statusTitle}. ${paintHint}` : statusTitle;

  if (!active) return null;

  return (
    <div className="chat-connection-overlay" role="status" aria-label={ariaLabel} aria-busy={!reduceMotion}>
      <div className={`chat-connection-overlay__edge chat-connection-overlay__edge--${variant}`}>
        {!reduceMotion && (
          <div
            className={`chat-connection-overlay__edge-shimmer chat-connection-overlay__edge-shimmer--${variant}`}
          />
        )}
      </div>
    </div>
  );
}
