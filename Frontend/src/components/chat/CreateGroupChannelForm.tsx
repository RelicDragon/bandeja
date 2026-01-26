import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Users, Hash } from 'lucide-react';
import { chatApi, GroupChannel } from '@/api/chat';
import toast from 'react-hot-toast';
import { BaseModal } from '@/components/BaseModal';

interface CreateGroupChannelFormProps {
  isChannel: boolean;
  onClose: () => void;
  onSuccess: (groupChannel: GroupChannel) => void;
}

export const CreateGroupChannelForm = ({ isChannel, onClose, onSuccess }: CreateGroupChannelFormProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error(t('chat.nameRequired', { defaultValue: 'Name is required' }));
      return;
    }

    if (name.length > 100) {
      toast.error(t('chat.nameTooLong', { defaultValue: 'Name must be 100 characters or less' }));
      return;
    }

    setLoading(true);
    try {
      const response = await chatApi.createGroupChannel({
        name: name.trim(),
        isChannel,
        isPublic: true
      });
      
      toast.success(
        isChannel 
          ? t('chat.channelCreated', { defaultValue: 'Channel created successfully' })
          : t('chat.groupCreated', { defaultValue: 'Group created successfully' })
      );
      
      setName('');
      onSuccess(response.data);
    } catch (error: any) {
      console.error('Failed to create group/channel:', error);
      toast.error(
        error?.response?.data?.message || 
        (isChannel 
          ? t('chat.channelCreateError', { defaultValue: 'Failed to create channel' })
          : t('chat.groupCreateError', { defaultValue: 'Failed to create group' }))
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      isBasic
      modalId="create-group-channel-form"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex items-center justify-between mb-6 p-6">
          <div className="flex items-center gap-3">
            {isChannel ? (
              <Hash className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            ) : (
              <Users className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            )}
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {isChannel 
                ? t('chat.createChannel', { defaultValue: 'Create Channel' })
                : t('chat.createGroup', { defaultValue: 'Create Group' })}
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('chat.name', { defaultValue: 'Name' })}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isChannel 
                ? t('chat.channelNamePlaceholder', { defaultValue: 'Enter channel name' })
                : t('chat.groupNamePlaceholder', { defaultValue: 'Enter group name' })}
              maxLength={100}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {name.length}/100
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('common.creating', { defaultValue: 'Creating...' })}
                </>
              ) : (
                t('common.create', { defaultValue: 'Create' })
              )}
            </button>
          </div>
        </form>
    </BaseModal>
  );
};
