import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, Select } from '@/components';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { Gender } from '@/types';

interface GenderSetModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function GenderSetModal({ open, onClose, onSaved }: GenderSetModalProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [gender, setGender] = useState<Gender>('PREFER_NOT_TO_SAY');
  const [preferNotToSayAcknowledged, setPreferNotToSayAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const currentGender = (user?.gender as Gender | undefined) || 'PREFER_NOT_TO_SAY';
    setGender(currentGender);
    setPreferNotToSayAcknowledged(
      currentGender === 'PREFER_NOT_TO_SAY' && user?.genderIsSet === true
    );
  }, [open, user?.gender, user?.genderIsSet]);

  const canConfirm =
    gender === 'MALE' ||
    gender === 'FEMALE' ||
    (gender === 'PREFER_NOT_TO_SAY' && preferNotToSayAcknowledged);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSaving(true);
    try {
      const response = await usersApi.updateProfile({
        gender,
        genderIsSet: true,
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
    <Dialog open={open} onClose={() => !isSaving && onClose()} modalId="gender-set-modal">
      <DialogContent className="max-w-md p-6 pt-10">
        <div className="space-y-4">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('games.genderPromptModalTitle', { defaultValue: 'Set your gender' })}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('games.genderPromptModalSubtitle', { defaultValue: 'This helps us show better game matches and unlock mixed-gender events.' })}
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('profile.gender')}
            </label>
            <Select
              options={[
                { value: 'MALE', label: t('profile.male') },
                { value: 'FEMALE', label: t('profile.female') },
                { value: 'PREFER_NOT_TO_SAY', label: t('profile.preferNotToSay') },
              ]}
              value={gender}
              onChange={(value) => {
                setGender(value as Gender);
                if (value !== 'PREFER_NOT_TO_SAY') {
                  setPreferNotToSayAcknowledged(false);
                }
              }}
            />
          </div>

          {gender === 'PREFER_NOT_TO_SAY' && (
            <div className="flex items-start">
              <input
                type="checkbox"
                id="gender-prompt-prefer-not-to-say-ack"
                checked={preferNotToSayAcknowledged}
                onChange={(e) => setPreferNotToSayAcknowledged(e.target.checked)}
                className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="gender-prompt-prefer-not-to-say-ack" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                {t('profile.preferNotToSayAcknowledgment')}
              </label>
            </div>
          )}

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
