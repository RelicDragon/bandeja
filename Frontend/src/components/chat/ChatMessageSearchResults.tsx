import { useState, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { chatApi, SearchMessageResult, ChatMessage, getLastMessageText } from '@/api/chat';
import { getSystemMessageText } from '@/utils/systemMessages';
import { formatRelativeTime, formatDate } from '@/utils/dateFormat';
import { MessageCircle, Gamepad2, Swords, Trophy, Dumbbell, Beer, Bug, User, ShoppingBag, Hash } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';

interface ChatMessageSearchResultsProps {
  query: string;
  chatsFilter?: 'users' | 'bugs' | 'channels';
  insertBetween?: ReactNode;
  onResultClick: (chatId: string, chatType: 'user' | 'bug' | 'game' | 'group' | 'channel', options?: { initialChatType?: string }) => void;
  messagesExpanded?: boolean;
  gamesExpanded?: boolean;
  channelsExpanded?: boolean;
  bugsExpanded?: boolean;
  marketListingsExpanded?: boolean;
  onMessagesToggle?: () => void;
  onGamesToggle?: () => void;
  onChannelsToggle?: () => void;
  onBugsToggle?: () => void;
  onMarketListingsToggle?: () => void;
}

function getContextLabel(result: SearchMessageResult, t: (key: string, opts?: any) => string): string {
  const { context, message } = result;
  if (!context) return '';
  if (message.chatContextType === 'GAME' && context && 'name' in context) {
    return (context as { name?: string }).name || t('chat.inGame', { defaultValue: 'In game' });
  }
  if (message.chatContextType === 'USER' && context && 'user1' in context) {
    const uc = context as { user1: { firstName?: string; lastName?: string }; user2: { firstName?: string; lastName?: string } };
    const other = uc.user1?.firstName ? uc.user2 : uc.user1;
    return `${t('chat.chatWith', { defaultValue: 'Chat with' })} ${other?.firstName || ''} ${other?.lastName || ''}`.trim();
  }
  if (message.chatContextType === 'BUG') {
    return t('chat.bugReport', { defaultValue: 'Bug report' });
  }
  if (message.chatContextType === 'GROUP' && context && 'name' in context) {
    return (context as { name?: string }).name || '';
  }
  return '';
}

function getGameLocationAndTime(
  context: { club?: { name?: string }; court?: { name?: string; club?: { name?: string } }; city?: { name?: string }; startTime?: string; timeIsSet?: boolean }
): string | null {
  if (!context) return null;
  const location = context.court?.club?.name || context.club?.name || context.city?.name;
  const locationStr = location
    ? (context.court?.name ? `${location} • ${context.court.name}` : location)
    : null;
  if (!locationStr) return null;
  if (context.timeIsSet === false) return locationStr;
  if (!context.startTime) return locationStr;
  return `${locationStr} • ${formatDate(context.startTime, 'PPp')}`;
}

function getEntityType(result: SearchMessageResult): string | undefined {
  const et =
    result.gameEntityType ??
    (result.message as { gameEntityType?: string }).gameEntityType ??
    (result.context as { entityType?: string } | null)?.entityType;
  return et != null ? String(et) : undefined;
}

function getChatIcon(chatContextType: string, result: SearchMessageResult) {
  if (chatContextType === 'GAME') {
    const et = getEntityType(result);
    if (et === 'TOURNAMENT') return Swords;
    if (et === 'LEAGUE' || et === 'LEAGUE_SEASON') return Trophy;
    if (et === 'TRAINING') return Dumbbell;
    if (et === 'BAR') return Beer;
    return Gamepad2;
  }
  if (chatContextType === 'BUG') return Bug;
  if (chatContextType === 'USER') return User;
  if (chatContextType === 'GROUP' && (result.context as { marketItemId?: string } | null)?.marketItemId) return ShoppingBag;
  return MessageCircle;
}

function getMessagePreview(message: ChatMessage): string {
  if (message.content?.trim().startsWith('{')) {
    const text = getSystemMessageText(message.content);
    if (text) return text;
  }
  if (message.poll?.question) return message.poll.question;
  return getLastMessageText(message) || '';
}

function ResultItem({ r, onResultClick, t }: { r: SearchMessageResult; onResultClick: ChatMessageSearchResultsProps['onResultClick']; t: (k: string, o?: any) => string }) {
  const chatType = r.message.chatContextType === 'GROUP' && (r.context as { isChannel?: boolean })?.isChannel ? 'channel' : r.message.chatContextType === 'USER' ? 'user' : r.message.chatContextType === 'BUG' ? 'bug' : r.message.chatContextType === 'GAME' ? 'game' : 'group';
  const ctxLabel = getContextLabel(r, t);
  const preview = getMessagePreview(r.message);
  return (
    <button
      type="button"
      className="w-full text-left px-4 py-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 flex flex-col gap-1"
      onClick={() => onResultClick(r.message.contextId, chatType, r.message.chatContextType === 'GAME' ? { initialChatType: r.message.chatType } : undefined)}
    >
      <div className="flex text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-start gap-0.5 min-w-0 flex-1">
          {(() => {
            const Icon = getChatIcon(r.message.chatContextType, r);
            return <Icon size={14} className="shrink-0" />;
          })()}
          <span className="break-words min-w-0">
            {r.message.chatContextType === 'GAME' && r.context && ('club' in r.context || 'city' in r.context)
              ? [ctxLabel, getGameLocationAndTime(r.context as Parameters<typeof getGameLocationAndTime>[0])].filter(Boolean).join(' · ') + ' · '
              : ctxLabel + ' · '}
            {formatRelativeTime(r.message.createdAt)}
          </span>
        </span>
      </div>
      <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{preview || t('chat.mediaMessage', { defaultValue: 'Media' })}</p>
    </button>
  );
}

export const ChatMessageSearchResults = ({ query, chatsFilter, insertBetween, onResultClick, messagesExpanded = true, gamesExpanded = true, channelsExpanded = true, bugsExpanded = true, marketListingsExpanded = true, onMessagesToggle, onGamesToggle, onChannelsToggle, onBugsToggle, onMarketListingsToggle }: ChatMessageSearchResultsProps) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<SearchMessageResult[]>([]);
  const [gameMessages, setGameMessages] = useState<SearchMessageResult[]>([]);
  const [channelMessages, setChannelMessages] = useState<SearchMessageResult[]>([]);
  const [bugMessages, setBugMessages] = useState<SearchMessageResult[]>([]);
  const [marketMessages, setMarketMessages] = useState<SearchMessageResult[]>([]);
  const [messagesPage, setMessagesPage] = useState(1);
  const [gamePage, setGamePage] = useState(1);
  const [channelPage, setChannelPage] = useState(1);
  const [bugsPage, setBugsPage] = useState(1);
  const [marketPage, setMarketPage] = useState(1);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [gameHasMore, setGameHasMore] = useState(false);
  const [channelHasMore, setChannelHasMore] = useState(false);
  const [bugsHasMore, setBugsHasMore] = useState(false);
  const [marketHasMore, setMarketHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingGames, setLoadingGames] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingBugs, setLoadingBugs] = useState(false);
  const [loadingMarket, setLoadingMarket] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setMessages([]);
      setGameMessages([]);
      setChannelMessages([]);
      setBugMessages([]);
      setMarketMessages([]);
      setMessagesPage(1);
      setGamePage(1);
      setChannelPage(1);
      setBugsPage(1);
      setMarketPage(1);
      return;
    }
    let cancelled = false;
    setLoading(true);
    chatApi.searchMessages(query)
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages || []);
        setGameMessages(res.gameMessages || []);
        setChannelMessages(res.channelMessages || []);
        setBugMessages(res.bugMessages || []);
        setMarketMessages(res.marketMessages || []);
        setMessagesHasMore(res.messagesPagination?.hasMore ?? false);
        setGameHasMore(res.gamePagination?.hasMore ?? false);
        setChannelHasMore(res.channelPagination?.hasMore ?? false);
        setBugsHasMore(res.bugsPagination?.hasMore ?? false);
        setMarketHasMore(res.marketPagination?.hasMore ?? false);
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
          setGameMessages([]);
          setChannelMessages([]);
          setBugMessages([]);
          setMarketMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [query]);

  const loadMoreMessages = () => {
    if (!messagesHasMore || loadingMessages) return;
    setLoadingMessages(true);
    chatApi.searchMessages(query, { section: 'messages', messagesPage: messagesPage + 1 })
      .then((res) => {
        setMessages((prev) => [...prev, ...(res.messages || [])]);
        setMessagesHasMore(res.messagesPagination?.hasMore ?? false);
        setMessagesPage((p) => p + 1);
      })
      .catch(() => setMessagesHasMore(false))
      .finally(() => setLoadingMessages(false));
  };

  const loadMoreGames = () => {
    if (!gameHasMore || loadingGames) return;
    setLoadingGames(true);
    chatApi.searchMessages(query, { section: 'games', gamePage: gamePage + 1 })
      .then((res) => {
        setGameMessages((prev) => [...prev, ...(res.gameMessages || [])]);
        setGameHasMore(res.gamePagination?.hasMore ?? false);
        setGamePage((p) => p + 1);
      })
      .catch(() => setGameHasMore(false))
      .finally(() => setLoadingGames(false));
  };

  const loadMoreChannels = () => {
    if (!channelHasMore || loadingChannels) return;
    setLoadingChannels(true);
    chatApi.searchMessages(query, { section: 'channels', channelPage: channelPage + 1 })
      .then((res) => {
        setChannelMessages((prev) => [...prev, ...(res.channelMessages || [])]);
        setChannelHasMore(res.channelPagination?.hasMore ?? false);
        setChannelPage((p) => p + 1);
      })
      .catch(() => setChannelHasMore(false))
      .finally(() => setLoadingChannels(false));
  };

  const loadMoreBugs = () => {
    if (!bugsHasMore || loadingBugs) return;
    setLoadingBugs(true);
    chatApi.searchMessages(query, { section: 'bugs', bugsPage: bugsPage + 1 })
      .then((res) => {
        setBugMessages((prev) => [...prev, ...(res.bugMessages || [])]);
        setBugsHasMore(res.bugsPagination?.hasMore ?? false);
        setBugsPage((p) => p + 1);
      })
      .catch(() => setBugsHasMore(false))
      .finally(() => setLoadingBugs(false));
  };

  const loadMoreMarket = () => {
    if (!marketHasMore || loadingMarket) return;
    setLoadingMarket(true);
    chatApi.searchMessages(query, { section: 'market', marketPage: marketPage + 1 })
      .then((res) => {
        setMarketMessages((prev) => [...prev, ...(res.marketMessages || [])]);
        setMarketHasMore(res.marketPagination?.hasMore ?? false);
        setMarketPage((p) => p + 1);
      })
      .catch(() => setMarketHasMore(false))
      .finally(() => setLoadingMarket(false));
  };

  const totalCount = messages.length + gameMessages.length + channelMessages.length + bugMessages.length + marketMessages.length;

  if (!query.trim()) return null;
  if (loading && totalCount === 0) {
    return (
      <div className="px-4 py-8 flex justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (totalCount === 0 && !insertBetween) {
    return (
      <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
        {t('chat.noMessageResults', { defaultValue: 'No messages found' })}
      </div>
    );
  }

  const channelsFirst = chatsFilter === 'channels';
  const bugsFirst = chatsFilter === 'bugs';
  const renderLoadMore = (onLoad: () => void, hasMore: boolean, loadingMore: boolean) =>
    hasMore ? (
      <button
        type="button"
        onClick={onLoad}
        disabled={loadingMore}
        className="w-full py-3 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50 border-b border-gray-200 dark:border-gray-700"
      >
        {loadingMore ? t('chat.messages.loading', { defaultValue: 'Loading...' }) : t('chat.loadMoreResults', { defaultValue: 'Load more' })}
      </button>
    ) : null;

  const renderGamesSection = () =>
    gameMessages.length > 0 ? (
      <CollapsibleSection
        title={t('chat.searchGamesSection', { defaultValue: 'Game chats' })}
        expanded={gamesExpanded}
        onToggle={onGamesToggle ?? (() => {})}
        icon={Gamepad2}
      >
        {gameMessages.map((r) => (
          <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
        ))}
        {renderLoadMore(loadMoreGames, gameHasMore, loadingGames)}
      </CollapsibleSection>
    ) : null;

  const renderBugsSection = () =>
    bugMessages.length > 0 ? (
      <CollapsibleSection
        title={t('chat.searchBugsChatsSection', { defaultValue: 'Bugs chats' })}
        expanded={bugsExpanded}
        onToggle={onBugsToggle ?? (() => {})}
        icon={Bug}
      >
        {bugMessages.map((r) => (
          <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
        ))}
        {renderLoadMore(loadMoreBugs, bugsHasMore, loadingBugs)}
      </CollapsibleSection>
    ) : null;

  const renderMarketSection = () =>
    marketMessages.length > 0 ? (
      <CollapsibleSection
        title={t('chat.searchMarketListingsSection', { defaultValue: 'Listings' })}
        expanded={marketListingsExpanded}
        onToggle={onMarketListingsToggle ?? (() => {})}
        icon={ShoppingBag}
      >
        {marketMessages.map((r) => (
          <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
        ))}
        {renderLoadMore(loadMoreMarket, marketHasMore, loadingMarket)}
      </CollapsibleSection>
    ) : null;

  return (
    <>
      {bugsFirst ? (
        <>
          {renderBugsSection()}
          {messages.length > 0 && (
            <CollapsibleSection
              title={t('chat.searchUserGroupSection', { defaultValue: 'User & group chats' })}
              expanded={messagesExpanded}
              onToggle={onMessagesToggle ?? (() => {})}
              icon={MessageCircle}
            >
              {messages.map((r) => (
                <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
              ))}
              {renderLoadMore(loadMoreMessages, messagesHasMore, loadingMessages)}
            </CollapsibleSection>
          )}
          {renderGamesSection()}
          {channelMessages.length > 0 && (
            <CollapsibleSection
              title={t('chat.searchChannelsMessagesSection', { defaultValue: "Channels' messages" })}
              expanded={channelsExpanded}
              onToggle={onChannelsToggle ?? (() => {})}
              icon={Hash}
            >
              {channelMessages.map((r) => (
                <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
              ))}
              {renderLoadMore(loadMoreChannels, channelHasMore, loadingChannels)}
            </CollapsibleSection>
          )}
          {renderMarketSection()}
        </>
      ) : channelsFirst ? (
        <>
          {channelMessages.length > 0 && (
            <CollapsibleSection
              title={t('chat.searchChannelsMessagesSection', { defaultValue: "Channels' messages" })}
              expanded={channelsExpanded}
              onToggle={onChannelsToggle ?? (() => {})}
              icon={Hash}
            >
              {channelMessages.map((r) => (
                <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
              ))}
              {renderLoadMore(loadMoreChannels, channelHasMore, loadingChannels)}
            </CollapsibleSection>
          )}
          {insertBetween}
          {messages.length > 0 && (
            <CollapsibleSection
              title={t('chat.searchUserGroupSection', { defaultValue: 'User & group chats' })}
              expanded={messagesExpanded}
              onToggle={onMessagesToggle ?? (() => {})}
              icon={MessageCircle}
            >
              {messages.map((r) => (
                <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
              ))}
              {renderLoadMore(loadMoreMessages, messagesHasMore, loadingMessages)}
            </CollapsibleSection>
          )}
          {renderGamesSection()}
          {renderBugsSection()}
          {renderMarketSection()}
        </>
      ) : (
        <>
          {messages.length > 0 && (
            <CollapsibleSection
              title={t('chat.searchUserGroupSection', { defaultValue: 'User & group chats' })}
              expanded={messagesExpanded}
              onToggle={onMessagesToggle ?? (() => {})}
              icon={MessageCircle}
            >
              {messages.map((r) => (
                <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
              ))}
              {renderLoadMore(loadMoreMessages, messagesHasMore, loadingMessages)}
            </CollapsibleSection>
          )}
          {renderGamesSection()}
          {channelMessages.length > 0 && (
            <CollapsibleSection
              title={t('chat.searchChannelsMessagesSection', { defaultValue: "Channels' messages" })}
              expanded={channelsExpanded}
              onToggle={onChannelsToggle ?? (() => {})}
              icon={Hash}
            >
              {channelMessages.map((r) => (
                <ResultItem key={r.message.id} r={r} onResultClick={onResultClick} t={t} />
              ))}
              {renderLoadMore(loadMoreChannels, channelHasMore, loadingChannels)}
            </CollapsibleSection>
          )}
          {renderBugsSection()}
          {renderMarketSection()}
        </>
      )}
    </>
  );
};
