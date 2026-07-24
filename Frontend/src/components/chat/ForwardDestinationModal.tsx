import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import type { ChatContextType, ChatMessage } from '@/api/chat';
import { forwardMessageToContext } from '@/services/chat/forwardMessage';
import {
  destinationsFromChatItems,
  forwardDestinationKey,
  loadLocalForwardChatItems,
  loadNetworkForwardChatItems,
  mergeForwardDestinations,
  type ForwardDestination,
} from '@/services/chat/forwardDestinations';
import { ForwardDestinationAvatar } from '@/components/chat/ForwardDestinationAvatar';
import { navigateToChatContext } from '@/utils/navigateToChatContext';
import { useAuthStore } from '@/store/authStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

interface ForwardDestinationModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: ChatMessage | null;
  currentContextType: ChatContextType | null;
  currentContextId: string | null;
}

export function ForwardDestinationModal({
  isOpen,
  onClose,
  message,
  currentContextType,
  currentContextId,
}: ForwardDestinationModalProps) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const blockedUserIds = useAuthStore((s) => s.user?.blockedUserIds);
  const [destinations, setDestinations] = useState<ForwardDestination[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    setQuery('');
    setSendingTo(null);
    setLoading(true);
    setDestinations([]);

    const exclude = { contextType: currentContextType, contextId: currentContextId };
    const blocked = blockedUserIds ?? [];

    void (async () => {
      try {
        const localItems = await loadLocalForwardChatItems();
        if (cancelled) return;
        const localDest = destinationsFromChatItems(localItems, userId, t, exclude, blocked);
        setDestinations(localDest);

        try {
          const networkItems = await loadNetworkForwardChatItems(userId, blocked);
          if (cancelled) return;
          const networkDest = destinationsFromChatItems(networkItems, userId, t, exclude, blocked);
          setDestinations(mergeForwardDestinations(localDest, networkDest, { networkAuthoritative: true }));
        } catch (err) {
          console.error('Forward destinations network load failed:', err);
        }
      } catch (err) {
        console.error('Forward destinations local load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, blockedUserIds, currentContextType, currentContextId, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter(
      (d) => d.title.toLowerCase().includes(q) || d.preview.toLowerCase().includes(q)
    );
  }, [destinations, query]);

  const handlePick = async (dest: ForwardDestination) => {
    if (!message || sendingTo) return;
    const busyKey = forwardDestinationKey(dest);
    setSendingTo(busyKey);
    const toastId = toast.loading(t('chat.forwardSending', { defaultValue: 'Sending…' }));
    try {
      const result = await forwardMessageToContext(message, dest.contextType, dest.contextId, {
        onSuccess: () => {
          toast.success(t('chat.forwardSent', { defaultValue: 'Forwarded' }), { id: toastId });
        },
        onFailed: () => {
          toast.error(t('chat.forwardFailed', { defaultValue: 'Could not forward' }), { id: toastId });
        },
      });
      if (result.ok) {
        onClose();
        navigateToChatContext(dest.contextType, dest.contextId, {
          isChannel: dest.kind === 'channel',
          forceReload: true,
          replace: false,
        });
      } else {
        toast.error(t('chat.forwardFailed', { defaultValue: 'Could not forward' }), { id: toastId });
      }
    } catch {
      toast.error(t('chat.forwardFailed', { defaultValue: 'Could not forward' }), { id: toastId });
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="forward-destination-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.forwardTo', { defaultValue: 'Forward to…' })}</DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60 px-3 py-2.5">
            <Search className="w-4 h-4 text-gray-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search', { defaultValue: 'Search' })}
              className="w-full bg-transparent text-sm outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-2 pb-3">
          {loading && destinations.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('common.loading', { defaultValue: 'Loading…' })}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {loading
                ? t('common.loading', { defaultValue: 'Loading…' })
                : query.trim()
                  ? t('chat.forwardNoMatches', { defaultValue: 'No matches' })
                  : t('chat.forwardNoChats', { defaultValue: 'No chats to forward to' })}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((dest) => {
                const key = forwardDestinationKey(dest);
                const busy = sendingTo === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => void handlePick(dest)}
                      disabled={!!sendingTo}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 transition-colors"
                    >
                      <ForwardDestinationAvatar dest={dest} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                          {dest.title}
                        </span>
                        {dest.preview ? (
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                            {dest.preview}
                          </span>
                        ) : null}
                      </span>
                      {busy ? (
                        <span className="text-xs text-sky-500 shrink-0 font-medium">
                          {t('chat.forwardSending', { defaultValue: 'Sending…' })}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
