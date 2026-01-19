import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch, Button } from '@/components';
import { User } from '@/types';
import { usersApi } from '@/api';
import toast from 'react-hot-toast';
import { BaseModal } from './BaseModal';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUpdate: (user: User) => void;
}

type TabType = 'push' | 'telegram';

export const NotificationSettingsModal = ({
  isOpen,
  onClose,
  user,
  onUpdate,
}: NotificationSettingsModalProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('push');
  const [isSaving, setIsSaving] = useState(false);
  
  const [sendTelegramMessages, setSendTelegramMessages] = useState(false);
  const [sendTelegramInvites, setSendTelegramInvites] = useState(false);
  const [sendTelegramDirectMessages, setSendTelegramDirectMessages] = useState(false);
  const [sendTelegramReminders, setSendTelegramReminders] = useState(false);
  const [sendTelegramWalletNotifications, setSendTelegramWalletNotifications] = useState(false);
  const [sendPushMessages, setSendPushMessages] = useState(false);
  const [sendPushInvites, setSendPushInvites] = useState(false);
  const [sendPushDirectMessages, setSendPushDirectMessages] = useState(false);
  const [sendPushReminders, setSendPushReminders] = useState(false);
  const [sendPushWalletNotifications, setSendPushWalletNotifications] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setSendTelegramMessages(user.sendTelegramMessages ?? true);
      setSendTelegramInvites(user.sendTelegramInvites ?? true);
      setSendTelegramDirectMessages(user.sendTelegramDirectMessages ?? true);
      setSendTelegramReminders(user.sendTelegramReminders ?? true);
      setSendTelegramWalletNotifications(user.sendTelegramWalletNotifications ?? true);
      setSendPushMessages(user.sendPushMessages ?? true);
      setSendPushInvites(user.sendPushInvites ?? true);
      setSendPushDirectMessages(user.sendPushDirectMessages ?? true);
      setSendPushReminders(user.sendPushReminders ?? true);
      setSendPushWalletNotifications(user.sendPushWalletNotifications ?? true);
    }
  }, [isOpen, user]);

  const resetToInitialValues = () => {
    if (user) {
      setSendTelegramMessages(user.sendTelegramMessages ?? true);
      setSendTelegramInvites(user.sendTelegramInvites ?? true);
      setSendTelegramDirectMessages(user.sendTelegramDirectMessages ?? true);
      setSendTelegramReminders(user.sendTelegramReminders ?? true);
      setSendTelegramWalletNotifications(user.sendTelegramWalletNotifications ?? true);
      setSendPushMessages(user.sendPushMessages ?? true);
      setSendPushInvites(user.sendPushInvites ?? true);
      setSendPushDirectMessages(user.sendPushDirectMessages ?? true);
      setSendPushReminders(user.sendPushReminders ?? true);
      setSendPushWalletNotifications(user.sendPushWalletNotifications ?? true);
    }
  };


  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const response = await usersApi.updateProfile({
        sendTelegramMessages,
        sendTelegramInvites,
        sendTelegramDirectMessages,
        sendTelegramReminders,
        sendTelegramWalletNotifications,
        sendPushMessages,
        sendPushInvites,
        sendPushDirectMessages,
        sendPushReminders,
        sendPushWalletNotifications,
      });
      onUpdate(response.data);
      toast.success(t('profile.notificationSettingsSaved'));
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('profile.notificationSettingsSaveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    resetToInitialValues();
    onClose();
  };

  const NotificationToggle = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <div className="flex-1 min-w-0">
        <label className="text-sm font-medium text-gray-900 dark:text-white block mb-1">
          {label}
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
      <div className="flex-shrink-0 pt-1">
        <ToggleSwitch checked={checked} onChange={onChange} />
      </div>
    </div>
  );

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={handleCancel} 
      isBasic 
      modalId="notification-settings-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('profile.notificationSettings') || 'Notification Settings'}
          </h2>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('push')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'push'
                ? 'border-b-2 border-primary-600 text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t('profile.pushNotifications') || 'Push'}
          </button>
          <button
            onClick={() => setActiveTab('telegram')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'telegram'
                ? 'border-b-2 border-primary-600 text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t('profile.telegram') || 'Telegram'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'push' && (
            <div className="space-y-0">
              <NotificationToggle
                label={t('profile.sendPushMessages') || 'Receive chat notifications'}
                description={t('profile.sendPushMessagesDescription') || 'Get notified when someone sends a message in your game chats or bug reports'}
                checked={sendPushMessages}
                onChange={setSendPushMessages}
              />
              <NotificationToggle
                label={t('profile.sendPushInvites') || 'Receive invite notifications'}
                description={t('profile.sendPushInvitesDescription') || 'Get notified when someone invites you to a game'}
                checked={sendPushInvites}
                onChange={setSendPushInvites}
              />
              <NotificationToggle
                label={t('profile.sendPushDirectMessages') || 'Receive direct messages'}
                description={t('profile.sendPushDirectMessagesDescription') || 'Get notified when someone sends you a direct message'}
                checked={sendPushDirectMessages}
                onChange={setSendPushDirectMessages}
              />
              <NotificationToggle
                label={t('profile.sendPushReminders') || 'Receive reminders'}
                description={t('profile.sendPushRemindersDescription') || 'Get notified 2 hours before your games, tournaments, or training bars start'}
                checked={sendPushReminders}
                onChange={setSendPushReminders}
              />
              <NotificationToggle
                label={t('profile.walletNotifications') || 'Wallet Notifications'}
                description={t('profile.walletNotificationsDescription') || 'Receive notifications for wallet transactions'}
                checked={sendPushWalletNotifications}
                onChange={setSendPushWalletNotifications}
              />
            </div>
          )}

          {activeTab === 'telegram' && (
            <div className="space-y-0">
              {user?.telegramUsername ? (
                <>
                  <NotificationToggle
                    label={t('profile.sendTelegramMessages') || 'Receive notifications from chats in Telegram'}
                    description={t('profile.sendTelegramMessagesDescription') || 'Get notified in Telegram when someone sends a message in your game chats or bug reports'}
                    checked={sendTelegramMessages}
                    onChange={setSendTelegramMessages}
                  />
                  <NotificationToggle
                    label={t('profile.sendTelegramInvites') || 'Receive invite notifications in Telegram'}
                    description={t('profile.sendTelegramInvitesDescription') || 'Get notified in Telegram when someone invites you to a game'}
                    checked={sendTelegramInvites}
                    onChange={setSendTelegramInvites}
                  />
                  <NotificationToggle
                    label={t('profile.sendTelegramDirectMessages') || 'Receive direct messages in Telegram'}
                    description={t('profile.sendTelegramDirectMessagesDescription') || 'Get notified in Telegram when someone sends you a direct message'}
                    checked={sendTelegramDirectMessages}
                    onChange={setSendTelegramDirectMessages}
                  />
                  <NotificationToggle
                    label={t('profile.sendTelegramReminders') || 'Receive reminders in Telegram'}
                    description={t('profile.sendTelegramRemindersDescription') || 'Get notified in Telegram 2 hours before your games, tournaments, or training bars start'}
                    checked={sendTelegramReminders}
                    onChange={setSendTelegramReminders}
                  />
                  <NotificationToggle
                    label={t('profile.walletNotifications') || 'Wallet Notifications'}
                    description={t('profile.walletNotificationsDescription') || 'Receive notifications for wallet transactions'}
                    checked={sendTelegramWalletNotifications}
                    onChange={setSendTelegramWalletNotifications}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {t('profile.telegramNotLinked')}
                  </p>
                  <button
                    onClick={() => window.open('https://t.me/PadelPulseBot', '_blank')}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    {t('profile.linkTelegram')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={isSaving}
          >
            {t('common.cancel') || 'Cancel'}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Save')}
          </Button>
        </div>
    </BaseModal>
  );
};
