import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch, Button } from '@/components';
import { usersApi, NotificationPreference, NotificationChannelType } from '@/api';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';

const CHANNEL_LABELS: Record<NotificationChannelType, string> = {
  PUSH: 'profile.pushNotifications',
  TELEGRAM: 'profile.telegram',
  WHATSAPP: 'WhatsApp',
  VIBER: 'Viber',
};

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: NotificationPreference[];
  onUpdate: (preferences: NotificationPreference[]) => void;
}

export const NotificationSettingsModal = ({
  isOpen,
  onClose,
  preferences,
  onUpdate,
}: NotificationSettingsModalProps) => {
  const { t } = useTranslation();
  const [activeChannel, setActiveChannel] = useState<NotificationChannelType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localPrefs, setLocalPrefs] = useState<Record<string, NotificationPreference>>({});

  useEffect(() => {
    if (isOpen && preferences.length > 0) {
      const map: Record<string, NotificationPreference> = {};
      for (const p of preferences) {
        map[p.channelType] = { ...p };
      }
      setLocalPrefs(map);
      setActiveChannel(preferences[0].channelType);
    }
  }, [isOpen, preferences]);

  const resetToInitialValues = () => {
    const map: Record<string, NotificationPreference> = {};
    for (const p of preferences) {
      map[p.channelType] = { ...p };
    }
    setLocalPrefs(map);
  };

  const handleSave = async () => {
    if (preferences.length === 0) return;

    setIsSaving(true);
    try {
      const payload = Object.values(localPrefs).map((p) => ({
        channelType: p.channelType,
        sendMessages: p.sendMessages,
        sendInvites: p.sendInvites,
        sendDirectMessages: p.sendDirectMessages,
        sendReminders: p.sendReminders,
        sendWalletNotifications: p.sendWalletNotifications,
      }));
      const res = await usersApi.updateNotificationPreferences(payload);
      onUpdate(res.data);
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

  const updatePref = (channelType: NotificationChannelType, field: keyof NotificationPreference, value: boolean) => {
    setLocalPrefs((prev) => {
      const p = prev[channelType];
      if (!p) return prev;
      return { ...prev, [channelType]: { ...p, [field]: value } };
    });
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
        <label className="text-sm font-medium text-gray-900 dark:text-white block mb-1">{label}</label>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <div className="flex-shrink-0 pt-1">
        <ToggleSwitch checked={checked} onChange={onChange} />
      </div>
    </div>
  );

  const TOGGLE_KEYS: (keyof NotificationPreference)[] = ['sendMessages', 'sendInvites', 'sendDirectMessages', 'sendReminders', 'sendWalletNotifications'];

  const LABELS: Record<NotificationChannelType, Record<string, { label: string; desc: string }>> = {
    PUSH: {
      sendMessages: { label: 'profile.sendPushMessages', desc: 'profile.sendPushMessagesDescription' },
      sendInvites: { label: 'profile.sendPushInvites', desc: 'profile.sendPushInvitesDescription' },
      sendDirectMessages: { label: 'profile.sendPushDirectMessages', desc: 'profile.sendPushDirectMessagesDescription' },
      sendReminders: { label: 'profile.sendPushReminders', desc: 'profile.sendPushRemindersDescription' },
      sendWalletNotifications: { label: 'profile.walletNotifications', desc: 'profile.walletNotificationsDescription' },
    },
    TELEGRAM: {
      sendMessages: { label: 'profile.sendTelegramMessages', desc: 'profile.sendTelegramMessagesDescription' },
      sendInvites: { label: 'profile.sendTelegramInvites', desc: 'profile.sendTelegramInvitesDescription' },
      sendDirectMessages: { label: 'profile.sendTelegramDirectMessages', desc: 'profile.sendTelegramDirectMessagesDescription' },
      sendReminders: { label: 'profile.sendTelegramReminders', desc: 'profile.sendTelegramRemindersDescription' },
      sendWalletNotifications: { label: 'profile.walletNotifications', desc: 'profile.walletNotificationsDescription' },
    },
    WHATSAPP: {
      sendMessages: { label: 'profile.sendPushMessages', desc: 'profile.sendPushMessagesDescription' },
      sendInvites: { label: 'profile.sendPushInvites', desc: 'profile.sendPushInvitesDescription' },
      sendDirectMessages: { label: 'profile.sendPushDirectMessages', desc: 'profile.sendPushDirectMessagesDescription' },
      sendReminders: { label: 'profile.sendPushReminders', desc: 'profile.sendPushRemindersDescription' },
      sendWalletNotifications: { label: 'profile.walletNotifications', desc: 'profile.walletNotificationsDescription' },
    },
    VIBER: {
      sendMessages: { label: 'profile.sendPushMessages', desc: 'profile.sendPushMessagesDescription' },
      sendInvites: { label: 'profile.sendPushInvites', desc: 'profile.sendPushInvitesDescription' },
      sendDirectMessages: { label: 'profile.sendPushDirectMessages', desc: 'profile.sendPushDirectMessagesDescription' },
      sendReminders: { label: 'profile.sendPushReminders', desc: 'profile.sendPushRemindersDescription' },
      sendWalletNotifications: { label: 'profile.walletNotifications', desc: 'profile.walletNotificationsDescription' },
    },
  };

  if (preferences.length === 0) return null;

  return (
    <Dialog open={isOpen} onClose={handleCancel} modalId="notification-settings-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('profile.notificationSettings') || 'Notification Settings'}</DialogTitle>
        </DialogHeader>

        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {preferences.map((p) => (
            <button
              key={p.channelType}
              onClick={() => setActiveChannel(p.channelType)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeChannel === p.channelType
                  ? 'border-b-2 border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t(CHANNEL_LABELS[p.channelType]) || CHANNEL_LABELS[p.channelType]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeChannel && localPrefs[activeChannel] && (
            <div className="space-y-0">
              {TOGGLE_KEYS.map((key) => {
                const { label, desc } = (LABELS[activeChannel] || LABELS.PUSH)[key] || LABELS.PUSH[key];
                return (
                  <NotificationToggle
                    key={key}
                    label={t(label)}
                    description={t(desc)}
                    checked={localPrefs[activeChannel][key] as boolean}
                    onChange={(v) => updatePref(activeChannel, key, v)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
            {t('common.cancel') || 'Cancel'}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
