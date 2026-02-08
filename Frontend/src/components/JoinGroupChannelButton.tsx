import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Newspaper, ShoppingBag } from 'lucide-react';
import { GroupChannel } from '@/api/chat';

interface JoinGroupChannelButtonProps {
  groupChannel: GroupChannel;
  onJoin: () => void | Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export const JoinGroupChannelButton: React.FC<JoinGroupChannelButtonProps> = ({
  groupChannel,
  onJoin,
  isLoading = false,
  className = '',
}) => {
  const { t } = useTranslation();
  const isChannel = groupChannel.isChannel;
  const isMarketItemChat = !isChannel && !!groupChannel.marketItemId;

  const buttonText = isMarketItemChat
    ? t('marketplace.discussListing', { defaultValue: 'Discuss listing' })
    : isChannel
      ? t('chat.joinChannel', { defaultValue: 'Join Channel' })
      : t('chat.joinGroup', { defaultValue: 'Join Group' });

  const loadingText = t('chat.joining', { defaultValue: 'Joining...' });

  return (
    <button
      onClick={onJoin}
      disabled={isLoading}
      className={`w-full px-6 py-3.5 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-[20px] hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(59,130,246,0.4)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.5)] hover:scale-[1.02] font-medium ${className}`}
    >
      {isLoading ? (
        <>
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          {loadingText}
        </>
      ) : (
        <>
          {isMarketItemChat ? <ShoppingBag size={20} /> : isChannel ? <Newspaper size={20} /> : <MessageCircle size={20} />}
          {buttonText}
        </>
      )}
    </button>
  );
};
