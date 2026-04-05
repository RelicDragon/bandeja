import type { ReactElement } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { ChatListItem } from './ChatListItem';
import { CityUserCard } from './CityUserCard';
import { getChatKey } from '@/utils/chatListHelpers';
import type { BasicUser } from '@/types';
import type { ChatItem, ChatType } from './chatListTypes';
import type { TFunction } from 'i18next';

type SearchRow =
  | { type: 'section'; label: 'users' | 'active' }
  | { type: 'chat'; data: ChatItem }
  | { type: 'contact'; user: BasicUser };

export type ChatListSearchSectionsSharedProps = {
  displayChats: SearchRow[];
  t: TFunction;
  activeChatsExpanded: boolean;
  setActiveChatsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  usersExpanded: boolean;
  setUsersExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  selectedChatId: string | null | undefined;
  selectedChatType: ChatType | null | undefined;
  handleChatClick: (chatId: string, chatType: ChatType, options?: { initialChatType?: string; searchQuery?: string }) => void;
  handleContactClick: (userId: string) => void | Promise<void>;
  isSearchMode: boolean;
  debouncedSearchQuery: string;
  chatsFilter: string;
  pinnedCountUsers: number;
  pinningId: string | null;
  handlePinUserChat: (chatId: string, isPinned: boolean) => Promise<void>;
  handlePinGroupChannel: (channelId: string, isPinned: boolean) => Promise<void>;
  mutedChats: Record<string, boolean>;
  togglingMuteId: string | null;
  handleMuteUserChat: (chatId: string, isMuted: boolean) => Promise<void>;
  handleMuteGroupChannel: (channelId: string, isMuted: boolean) => Promise<void>;
};

export type ChatListSearchSectionsProps = ChatListSearchSectionsSharedProps & {
  order: 'active-first' | 'users-first';
};

function splitSearchSections(displayChats: SearchRow[]) {
  const active: Array<{ type: 'chat'; data: ChatItem }> = [];
  const users: Array<{ type: 'contact'; user: BasicUser }> = [];
  let current: 'active' | 'users' | null = null;
  for (const item of displayChats) {
    if (item.type === 'section') current = item.label;
    else if (current === 'active' && item.type === 'chat') active.push(item);
    else if (current === 'users' && item.type === 'contact') users.push(item);
  }
  return { active, users };
}

export function ChatListSearchSections(p: ChatListSearchSectionsProps): ReactElement {
  const { active, users } = splitSearchSections(p.displayChats);
  const isUsersTab = p.chatsFilter === 'users';
  const q = p.debouncedSearchQuery.trim();

  const activeBlock =
    active.length > 0 ? (
      <CollapsibleSection
        title={p.t('chat.activeChats', { defaultValue: 'Active chats' })}
        expanded={p.activeChatsExpanded}
        onToggle={() => p.setActiveChatsExpanded((e) => !e)}
      >
        {active.map((item) => (
          <ChatListItem
            key={getChatKey(item.data)}
            item={item.data}
            selectedChatId={p.selectedChatId}
            selectedChatType={p.selectedChatType}
            onChatClick={p.handleChatClick}
            onContactClick={p.handleContactClick}
            isSearchMode={p.isSearchMode}
            searchQuery={q}
            pinnedCount={isUsersTab ? p.pinnedCountUsers : undefined}
            pinningId={isUsersTab ? p.pinningId : undefined}
            onPinUserChat={isUsersTab ? p.handlePinUserChat : undefined}
            onPinGroupChannel={isUsersTab ? p.handlePinGroupChannel : undefined}
            mutedChats={isUsersTab ? p.mutedChats : undefined}
            togglingMuteId={isUsersTab ? p.togglingMuteId : undefined}
            onMuteUserChat={isUsersTab ? p.handleMuteUserChat : undefined}
            onMuteGroupChannel={isUsersTab ? p.handleMuteGroupChannel : undefined}
          />
        ))}
      </CollapsibleSection>
    ) : null;

  const usersBlock =
    users.length > 0 ? (
      <CollapsibleSection
        title={p.t('chat.users', { defaultValue: 'Users' })}
        expanded={p.usersExpanded}
        onToggle={() => p.setUsersExpanded((e) => !e)}
      >
        {users.map((item) => (
          <CityUserCard
            key={`contact-${item.user.id}`}
            user={item.user}
            onClick={() => void p.handleContactClick(item.user.id)}
          />
        ))}
      </CollapsibleSection>
    ) : null;

  if (p.order === 'active-first') {
    return (
      <>
        {activeBlock}
        {usersBlock}
      </>
    );
  }
  return (
    <>
      {usersBlock}
      {activeBlock}
    </>
  );
}
