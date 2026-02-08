import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch, Button } from '@/components';
import { TelegramIcon } from '@/components/TelegramIcon';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { ViberIcon } from '@/components/ViberIcon';
import { usersApi, NotificationPreference, NotificationChannelType } from '@/api';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Bell, Square, SquareCheck } from 'lucide-react';

const CHANNEL_LABELS: Record<NotificationChannelType, string> = {
  PUSH: 'Push',
  TELEGRAM: 'profile.telegram',
  WHATSAPP: 'WhatsApp',
  VIBER: 'Viber',
};

const CHANNEL_ICONS: Record<NotificationChannelType, React.ReactNode> = {
  PUSH: <Bell size={16} />,
  TELEGRAM: <TelegramIcon size={16} />,
  WHATSAPP: <WhatsAppIcon size={16} />,
  VIBER: <ViberIcon size={16} />,
};

const CHANNEL_COLORS: Record<NotificationChannelType, string> = {
  PUSH: 'text-gray-900 dark:text-white',
  TELEGRAM: 'text-[#0088cc]',
  WHATSAPP: 'text-[#25D366]',
  VIBER: 'text-[#7360f2]',
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
  const TOGGLE_KEYS: (keyof NotificationPreference)[] = ['sendMessages', 'sendInvites', 'sendDirectMessages', 'sendReminders', 'sendWalletNotifications', 'sendMarketplaceNotifications'];
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
        sendMarketplaceNotifications: p.sendMarketplaceNotifications,
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

  const hasAnyEnabled = (channelType: NotificationChannelType): boolean => {
    const p = localPrefs[channelType];
    if (!p) return false;
    return TOGGLE_KEYS.some((key) => p[key] as boolean);
  };

  const allEnabled = (channelType: NotificationChannelType): boolean => {
    const p = localPrefs[channelType];
    if (!p) return false;
    return TOGGLE_KEYS.every((key) => p[key] as boolean);
  };

  const handleToggleAll = (channelType: NotificationChannelType, enable: boolean) => {
    setLocalPrefs((prev) => {
      const p = prev[channelType];
      if (!p) return prev;
      const updates = Object.fromEntries(TOGGLE_KEYS.map((k) => [k, enable]));
      return { ...prev, [channelType]: { ...p, ...updates } };
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

  const SWITCH_LABELS: Record<string, { label: string; desc: string }> = {
    sendMessages: { label: 'profile.sendMessages', desc: 'profile.sendMessagesDescription' },
    sendInvites: { label: 'profile.sendInvites', desc: 'profile.sendInvitesDescription' },
    sendDirectMessages: { label: 'profile.sendDirectMessages', desc: 'profile.sendDirectMessagesDescription' },
    sendReminders: { label: 'profile.sendReminders', desc: 'profile.sendRemindersDescription' },
    sendWalletNotifications: { label: 'profile.walletNotifications', desc: 'profile.walletNotificationsDescription' },
    sendMarketplaceNotifications: { label: 'profile.marketplaceNotifications', desc: 'profile.marketplaceNotificationsDescription' },
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
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 border-b-2 ${
                activeChannel === p.channelType
                  ? p.channelType === 'PUSH'
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : `${CHANNEL_COLORS[p.channelType]} border-current`
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {CHANNEL_ICONS[p.channelType]}
              {t(CHANNEL_LABELS[p.channelType]) || CHANNEL_LABELS[p.channelType]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeChannel && localPrefs[activeChannel] && (
            <div className="space-y-0">
              <div className={`flex items-center gap-2 mb-3 font-medium ${CHANNEL_COLORS[activeChannel]}`}>
                {CHANNEL_ICONS[activeChannel]}
                {t(CHANNEL_LABELS[activeChannel]) || CHANNEL_LABELS[activeChannel]}
              </div>
              <div className="flex justify-between gap-3 mb-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleToggleAll(activeChannel, false)}
                  disabled={!hasAnyEnabled(activeChannel)}
                  className="flex items-center gap-2 rounded-xl"
                >
                  <Square size={16} className="shrink-0" />
                  {t('profile.disable') || 'Disable'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleToggleAll(activeChannel, true)}
                  disabled={allEnabled(activeChannel)}
                  className="flex items-center gap-2 rounded-xl"
                >
                  <SquareCheck size={16} className="shrink-0" />
                  {t('profile.enable') || 'Enable'}
                </Button>
              </div>
              {TOGGLE_KEYS.map((key) => {
                const { label, desc } = SWITCH_LABELS[key];
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
