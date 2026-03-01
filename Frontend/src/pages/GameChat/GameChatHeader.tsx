import React, { ReactNode } from 'react';
import { ArrowLeft, Bug as BugIcon } from 'lucide-react';
import { ChatHeaderActions } from '@/components/chat/ChatHeaderActions';
import type { ChatContextType } from '@/api/chat';
import type { Game } from '@/types';

export interface GameChatHeaderActionsProps {
  showMute: boolean;
  showLeave: boolean;
  showParticipantsButton: boolean;
  isMuted: boolean;
  isTogglingMute: boolean;
  onToggleMute: () => void;
  onLeaveClick: () => void;
  leaveTitle: string;
  game: Game | null;
  onParticipantsClick: () => void;
}

export interface GameChatHeaderProps {
  isEmbedded: boolean;
  showLoadingHeader: boolean;
  contextType: ChatContextType;
  isBugChat: boolean;
  title: string;
  subtitle: string | null;
  icon: ReactNode;
  onBack: () => void;
  showPanelBack: boolean;
  onPanelBack: () => void;
  isTitleClickable: boolean;
  onTitleClick?: () => void;
  showHeaderActions: boolean;
  headerActions: GameChatHeaderActionsProps | null;
}

export const GameChatHeader: React.FC<GameChatHeaderProps> = ({
  isEmbedded,
  showLoadingHeader,
  contextType,
  isBugChat,
  title,
  subtitle,
  icon,
  onBack,
  showPanelBack,
  onPanelBack,
  isTitleClickable,
  onTitleClick,
  showHeaderActions,
  headerActions,
}) => {
  return (
    <header
      className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-40 shadow-lg"
      style={{ paddingTop: isEmbedded ? '0' : 'env(safe-area-inset-top)' }}
    >
      <div
        className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {showLoadingHeader ? (
          <div className="flex items-center gap-3 w-full">
            <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
              <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {!isEmbedded && (
                <button
                  onClick={onBack}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                >
                  <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                </button>
              )}
              {showPanelBack && (
                <div
                  className="hidden md:block transition-all duration-300 ease-in-out opacity-100 translate-x-0 w-auto"
                >
                  <button
                    onClick={onPanelBack}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                  >
                    <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                </div>
              )}
              <div
                className={`flex items-center gap-2 min-w-0 flex-1 ${isTitleClickable ? 'cursor-pointer' : ''}`}
                onClick={isTitleClickable ? onTitleClick : undefined}
                role={isTitleClickable ? 'button' : undefined}
              >
                {!isBugChat && <div className="flex-shrink-0">{icon}</div>}
                <div className="min-w-0 flex-1">
                  <h1
                    className={`${isBugChat ? 'text-base' : 'text-lg'} font-semibold text-gray-900 dark:text-white flex items-center gap-2 whitespace-nowrap overflow-hidden`}
                  >
                    {isBugChat && (
                      <BugIcon size={16} className="text-red-500 flex-shrink-0" />
                    )}
                    <span
                      className={`truncate ${
                        contextType === 'GROUP'
                          ? 'hover:text-primary-600 dark:hover:text-primary-400 transition-colors'
                          : ''
                      }`}
                    >
                      {title}
                    </span>
                  </h1>
                  {subtitle != null && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {showHeaderActions && headerActions != null && (
              <ChatHeaderActions
                showMute={headerActions.showMute}
                showLeave={headerActions.showLeave}
                showParticipantsButton={headerActions.showParticipantsButton}
                isMuted={headerActions.isMuted}
                isTogglingMute={headerActions.isTogglingMute}
                onToggleMute={headerActions.onToggleMute}
                onLeaveClick={headerActions.onLeaveClick}
                leaveTitle={headerActions.leaveTitle}
                game={headerActions.game}
                onParticipantsClick={headerActions.onParticipantsClick}
              />
            )}
          </>
        )}
      </div>
    </header>
  );
};
