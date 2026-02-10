import { useTranslation } from 'react-i18next';
import { AvatarUpload } from '@/components';
import { GroupChannel } from '@/api/chat';

interface GroupInfoPanelProps {
  groupChannel: GroupChannel;
  name: string;
  setName: (name: string) => void;
  canEdit: boolean;
  isSavingName: boolean;
  nameError: string | null;
  setNameError: (error: string | null) => void;
  onSaveName: () => void;
  onAvatarUpload: (file: File) => Promise<void>;
  onAvatarRemove: () => Promise<void>;
}

export const GroupInfoPanel = ({
  groupChannel,
  name,
  setName,
  canEdit,
  isSavingName,
  nameError,
  setNameError,
  onSaveName,
  onAvatarUpload,
  onAvatarRemove
}: GroupInfoPanelProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <AvatarUpload
          currentAvatar={groupChannel.avatar || undefined}
          onUpload={onAvatarUpload}
          onRemove={onAvatarRemove}
          disabled={!canEdit}
        />
      </div>

      <div>
        {canEdit ? (
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              onBlur={onSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSaveName();
                }
              }}
              disabled={isSavingName}
              maxLength={100}
              className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none ${
                nameError ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'
              }`}
              placeholder={groupChannel.isChannel
                ? t('chat.channelNamePlaceholder', { defaultValue: 'Enter channel name' })
                : t('chat.groupNamePlaceholder', { defaultValue: 'Enter group name' })}
            />
            {nameError && (
              <p className="text-sm text-red-500 dark:text-red-400">{nameError}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {name.length}/100
            </p>
          </div>
        ) : (
          <div className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
            {groupChannel.name}
          </div>
        )}
      </div>
    </div>
  );
};
