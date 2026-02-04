import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Hash } from 'lucide-react';
import { CreateGroupChannelForm } from './CreateGroupChannelForm';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { navigationService } from '@/services/navigationService';

interface CreateGroupChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export const CreateGroupChannelModal = ({ isOpen, onClose, onCreated }: CreateGroupChannelModalProps) => {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<'group' | 'channel' | null>(null);

  const handleSelectType = (type: 'group' | 'channel') => {
    setSelectedType(type);
  };

  const handleFormClose = () => {
    onClose();
    setSelectedType(null);
  };

  const handleFormSuccess = (groupChannel: any) => {
    if (onCreated) {
      onCreated();
    }
    handleFormClose();
    
    if (groupChannel.isChannel) {
      navigationService.navigateToChannelChat(groupChannel.id);
    } else {
      navigationService.navigateToGroupChat(groupChannel.id);
    }
  };

  if (selectedType) {
    return (
      <CreateGroupChannelForm
        isChannel={selectedType === 'channel'}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    );
  }

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="create-group-channel-modal">
      <DialogContent>
      <button
          onClick={() => handleSelectType('group')}
          className="px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2"
          style={{
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
          }}
        >
          <Users size={18} />
          {t('chat.createGroup', { defaultValue: 'Create Group' })}
        </button>
        <button
          onClick={() => handleSelectType('channel')}
          className="px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2"
          style={{
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
          }}
        >
          <Hash size={18} />
          {t('chat.createChannel', { defaultValue: 'Create Channel' })}
        </button>
      </DialogContent>
    </Dialog>
  );
};
