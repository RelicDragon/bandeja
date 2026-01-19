import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Hash } from 'lucide-react';
import { CreateGroupChannelForm } from './CreateGroupChannelForm';
import { BaseModal } from '@/components/BaseModal';

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

  const handleFormSuccess = () => {
    if (onCreated) {
      onCreated();
    }
    handleFormClose();
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
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isBasic
      modalId="create-group-channel-modal"
      showCloseButton={false}
      closeOnBackdropClick={true}
    >
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
    </BaseModal>
  );
};
