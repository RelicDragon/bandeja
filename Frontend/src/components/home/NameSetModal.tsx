import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, Input } from '@/components';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';

interface NameSetModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function NameSetModal({ open, onClose, onSaved }: NameSetModalProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');
  }, [open, user?.firstName, user?.lastName]);

  const canConfirm = firstName.trim().length >= 1 || lastName.trim().length >= 1;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSaving(true);
    try {
      const response = await usersApi.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nameIsSet: true,
      });
      updateUser(response.data);
      onSaved?.();
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || t('errors.generic'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !isSaving && onClose()} modalId="name-set-modal">
      <DialogContent className="max-w-md p-6 pt-10">
        <div className="space-y-4">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('home.noNamePromptModalTitle', { defaultValue: 'Set your name' })}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('home.noNamePromptModalSubtitle', { defaultValue: 'To better communicate with others, please set your name.' })}
          </p>
          <Input
            label={t('auth.firstName')}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t('auth.firstName')}
          />
          <Input
            label={t('auth.lastName')}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t('auth.lastName')}
          />
          <Button
            type="button"
            className="w-full"
            onClick={handleConfirm}
            disabled={!canConfirm || isSaving}
          >
            {isSaving ? t('app.loading') : t('common.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
