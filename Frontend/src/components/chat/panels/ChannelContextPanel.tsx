import { GroupChannel } from '@/api/chat';
import { GroupInfoPanel } from './GroupInfoPanel';
import { BugInfoPanel } from './BugInfoPanel';

interface ChannelContextPanelProps {
  groupChannel: GroupChannel;
  // Group Info Props
  name: string;
  setName: (name: string) => void;
  canEdit: boolean;
  isSavingName: boolean;
  nameError: string | null;
  setNameError: (error: string | null) => void;
  onSaveName: () => void;
  onAvatarUpload: (file: File) => Promise<void>;
  onAvatarRemove: () => Promise<void>;
  // Bug Info Props
  canEditBug: boolean;
  onUpdate?: () => void;
}

/**
 * Context-aware panel component that displays appropriate content based on channel type.
 * - Bug chats: Shows BugInfoPanel with bug details and management controls
 * - Market item chats: Could show MarketItemInfoPanel (future)
 * - Regular groups/channels: Shows GroupInfoPanel with avatar and name
 */
export const ChannelContextPanel = ({
  groupChannel,
  name,
  setName,
  canEdit,
  isSavingName,
  nameError,
  setNameError,
  onSaveName,
  onAvatarUpload,
  onAvatarRemove,
  canEditBug,
  onUpdate
}: ChannelContextPanelProps) => {
  // Determine context type
  const isBugChat = !!groupChannel.bug;
  const isMarketItemChat = !!groupChannel.marketItem;

  // Bug Chat Context
  if (isBugChat && groupChannel.bug) {
    return (
      <BugInfoPanel
        bug={groupChannel.bug as import('@/types').Bug}
        canEdit={canEditBug}
        onUpdate={onUpdate}
      />
    );
  }

  // Market Item Chat Context (future implementation)
  if (isMarketItemChat && groupChannel.marketItem) {
    // TODO: Implement MarketItemInfoPanel
    // return <MarketItemInfoPanel item={groupChannel.marketItem} />;
    // For now, fall back to regular group info
  }

  // Regular Group/Channel Context
  return (
    <GroupInfoPanel
      groupChannel={groupChannel}
      name={name}
      setName={setName}
      canEdit={canEdit}
      isSavingName={isSavingName}
      nameError={nameError}
      setNameError={setNameError}
      onSaveName={onSaveName}
      onAvatarUpload={onAvatarUpload}
      onAvatarRemove={onAvatarRemove}
    />
  );
};
