import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayerAvatar } from '@/components';
import { chatApi, UserChat } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { X } from 'lucide-react';

export const UnreadUserChats = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [userChats, setUserChats] = useState<UserChat[]>([]);
  const [userChatsUnreadCounts, setUserChatsUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadUserChats = async () => {
      if (!user?.id) return;
      
      try {
        const response = await chatApi.getUserChats();
        const chats = response.data || [];
        setUserChats(chats);
        
        if (chats.length > 0) {
          const chatIds = chats.map(chat => chat.id);
          const unreadResponse = await chatApi.getUserChatsUnreadCounts(chatIds);
          setUserChatsUnreadCounts(unreadResponse.data || {});
        }
      } catch (error) {
        console.error('Failed to load user chats:', error);
      }
    };

    loadUserChats();
  }, [user?.id]);

  const visibleChats = useMemo(() => {
    return userChats
      .filter(chat => {
        const hasUnread = (userChatsUnreadCounts[chat.id] || 0) > 0;
        const isPinned = chat.isPinned || false;
        return hasUnread || isPinned;
      })
      .sort((a, b) => {
        const aUnread = userChatsUnreadCounts[a.id] || 0;
        const bUnread = userChatsUnreadCounts[b.id] || 0;
        const aPinned = a.isPinned || false;
        const bPinned = b.isPinned || false;
        
        if (aUnread > 0 && bUnread === 0) return -1;
        if (aUnread === 0 && bUnread > 0) return 1;
        if (aUnread > 0 && bUnread > 0) return bUnread - aUnread;
        
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        
        return 0;
      });
  }, [userChats, userChatsUnreadCounts]);

  const handleUserChatClick = (chat: UserChat) => {
    navigate(`/user-chat/${chat.id}`, { state: { chat, contextType: 'USER' } });
  };

  const handleClose = async (e: React.MouseEvent, chat: UserChat) => {
    e.stopPropagation();
    
    try {
      const hasUnread = (userChatsUnreadCounts[chat.id] || 0) > 0;
      
      if (hasUnread) {
        await chatApi.markUserChatAsRead(chat.id);
        setUserChatsUnreadCounts(prev => ({
          ...prev,
          [chat.id]: 0
        }));
        
        await chatApi.pinUserChat(chat.id);
        setUserChats(prev => 
          prev.map(c => c.id === chat.id ? { ...c, isPinned: true } : c)
        );
      } else {
        await chatApi.unpinUserChat(chat.id);
        setUserChats(prev => 
          prev.map(c => c.id === chat.id ? { ...c, isPinned: false } : c)
        );
      }
    } catch (error) {
      console.error('Failed to close chat:', error);
    }
  };

  if (visibleChats.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 px-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {visibleChats.map(chat => {
          const otherUser = chat.user1Id === user?.id ? chat.user2 : chat.user1;
          const unreadCount = userChatsUnreadCounts[chat.id] || 0;
          
          return (
            <div
              key={chat.id}
              onClick={() => handleUserChatClick(chat)}
              className="relative flex-shrink-0 cursor-pointer group"
            >
              <PlayerAvatar
                player={otherUser}
                showName={false}
                smallLayout={true}
              />
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center border-2 border-white dark:border-gray-900">
                  <span className="text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </div>
              )}
              <button
                onClick={(e) => handleClose(e, chat)}
                className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-gray-800 dark:bg-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-2 border-white dark:border-gray-900 hover:bg-gray-900 dark:hover:bg-gray-600"
                aria-label="Close chat"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

