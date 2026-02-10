import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marketplaceApi } from '@/api/marketplace';
import toast from 'react-hot-toast';
import { MessageCircle, ArrowLeft } from 'lucide-react';

export const MarketplaceSellerChats = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    marketplaceApi.getSellerChats(id)
      .then(setChats)
      .catch(err => {
        toast.error(t('marketplace.failedToLoadConversations', { defaultValue: 'Failed to load conversations' }));
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleChatClick = (chatId: string) => {
    navigate(`/channel-chat/${chatId}`);
  };

  const handleBackClick = () => {
    navigate(`/marketplace/${id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">{t('common.loading', { defaultValue: 'Loading...' })}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <button
          onClick={handleBackClick}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('marketplace.buyerConversations', { defaultValue: 'Buyer Conversations' })}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {chats.length} {chats.length === 1 ? t('marketplace.conversation', { defaultValue: 'conversation' }) : t('marketplace.conversations', { defaultValue: 'conversations' })}
          </p>
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <MessageCircle size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              {t('marketplace.noConversationsYet', { defaultValue: 'No conversations yet' })}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {t('marketplace.buyersWillAppear', { defaultValue: 'Buyers will appear here when they express interest' })}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {chats.map(chat => {
              const buyer = chat.buyer || chat.participants?.find((p: any) => p.userId === chat.buyerId)?.user;
              const displayName = buyer
                ? `${buyer.firstName} ${buyer.lastName}`
                : t('marketplace.unknownBuyer', { defaultValue: 'Unknown buyer' });

              return (
                <div
                  key={chat.id}
                  onClick={() => handleChatClick(chat.id)}
                  className="px-4 py-4 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={buyer?.avatar || '/default-avatar.png'}
                      alt={displayName}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {displayName}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {chat.lastMessagePreview || t('marketplace.noMessages', { defaultValue: 'No messages yet' })}
                      </p>
                    </div>
                    <MessageCircle size={20} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
