import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Gamepad2, Search, Users } from 'lucide-react';
import type { ChatContextType, ChatMessage } from '@/api/chat';
import type { ChatItem } from '@/utils/chatListSort';
import { getChatTitle } from '@/utils/chatListSort';
import { mapThreadIndexRowsToSortedChatItems } from '@/services/chat/chatThreadIndex';
import { chatLocalDb } from '@/services/chat/chatLocalDb';
import { forwardMessageToContext } from '@/services/chat/forwardMessage';
import { parseMessagePreview } from '@/utils/messagePreview';
import { useAuthStore } from '@/store/authStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

type Destination = {
  contextType: ChatContextType;
  contextId: string;
  title: string;
  kind: 'user' | 'group' | 'game';
  preview: string;
};

function lastPreviewText(lm: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  // `lastMessage.preview` is the already-formatted last-message string (e.g. "[TYPE:GIF]").
  if (!lm || typeof lm !== 'object' || !('preview' in lm)) return '';
  const parsed = parseMessagePreview((lm as { preview?: string }).preview ?? null, t);
  return parsed && parsed !== '[Media]' ? parsed : '';
}

function itemToDestination(item: ChatItem, userId: string, t: ReturnType<typeof useTranslation>['t']): Destination | null {
  if (item.type === 'user') {
    return {
      contextType: 'USER',
      contextId: item.data.id,
      title: getChatTitle(item, userId) || '—',
      kind: 'user',
      preview: lastPreviewText(item.data.lastMessage, t),
    };
  }
  if (item.type === 'group' || item.type === 'channel') {
    return {
      contextType: 'GROUP',
      contextId: item.data.id,
      title: item.data.name?.trim() || '—',
      kind: 'group',
      preview: lastPreviewText(item.data.lastMessage, t),
    };
  }
  if (item.type === 'game') {
    return {
      contextType: 'GAME',
      contextId: item.data.id,
      title: item.data.name?.trim() || '—',
      kind: 'game',
      preview: lastPreviewText(item.data.lastMessage, t),
    };
  }
  return null;
}

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
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setQuery('');
    setLoading(true);
    void (async () => {
      try {
        // Load every thread-index row regardless of list tab, so DMs, groups,
        // channels and games all appear as forward targets.
        const rows = await chatLocalDb.threadIndex.toArray();
        if (cancelled) return;
        const items = mapThreadIndexRowsToSortedChatItems(rows);
        const seen = new Set<string>();
        const mapped = items
          .map((item) => (userId ? itemToDestination(item, userId, t) : null))
          .filter((d): d is Destination => !!d)
          .filter((d) => {
            // Drop the chat we're forwarding from and dedupe by context.
            if (d.contextType === currentContextType && d.contextId === currentContextId) {
              return false;
            }
            const key = `${d.contextType}:${d.contextId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        setDestinations(mapped);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, currentContextType, currentContextId, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter(
      (d) => d.title.toLowerCase().includes(q) || d.preview.toLowerCase().includes(q)
    );
  }, [destinations, query]);

  const handlePick = async (dest: Destination) => {
    if (!message || sendingTo) return;
    setSendingTo(dest.contextId);
    try {
      const ok = await forwardMessageToContext(message, dest.contextType, dest.contextId);
      if (ok) {
        toast.success(t('chat.forwardSent', { defaultValue: 'Forwarded' }));
        onClose();
      } else {
        toast.error(t('chat.forwardFailed', { defaultValue: 'Could not forward' }));
      }
    } catch {
      toast.error(t('chat.forwardFailed', { defaultValue: 'Could not forward' }));
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
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
            <Search className="w-4 h-4 text-gray-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search', { defaultValue: 'Search' })}
              className="w-full bg-transparent text-sm outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-2 pb-3">
          {loading ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('common.loading', { defaultValue: 'Loading…' })}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {query.trim()
                ? t('chat.forwardNoMatches', { defaultValue: 'No matches' })
                : t('chat.forwardNoChats', { defaultValue: 'No chats to forward to' })}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((dest) => {
                const key = `${dest.contextType}:${dest.contextId}`;
                const busy = sendingTo === dest.contextId;
                const Icon = dest.kind === 'game' ? Gamepad2 : Users;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => void handlePick(dest)}
                      disabled={!!sendingTo}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      <span className="shrink-0 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-300" />
                      </span>
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
                        <span className="text-xs text-gray-400 shrink-0">
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
