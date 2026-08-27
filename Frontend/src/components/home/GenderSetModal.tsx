import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, Select } from '@/components';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { Gender } from '@/types';

interface GenderSetModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  variant?: 'banner' | 'join';
}

const JOIN_GENDERS = ['MALE', 'FEMALE'] as const;

function joinChoiceClass(selected: boolean): string {
  return [
    'rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
    selected
      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-950/40 dark:text-primary-200'
      : 'border-gray-200 bg-gray-50 text-gray-800 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:hover:border-gray-600',
  ].join(' ');
}

export function GenderSetModal({ open, onClose, onSaved, variant = 'banner' }: GenderSetModalProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const isJoin = variant === 'join';

  const [gender, setGender] = useState<Gender>('PREFER_NOT_TO_SAY');
  const [preferNotToSayAcknowledged, setPreferNotToSayAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const currentGender = (user?.gender as Gender | undefined) || 'PREFER_NOT_TO_SAY';
    if (isJoin) {
      setGender(currentGender === 'MALE' || currentGender === 'FEMALE' ? currentGender : 'PREFER_NOT_TO_SAY');
      setPreferNotToSayAcknowledged(false);
      return;
    }
    setGender(currentGender);
    setPreferNotToSayAcknowledged(
      currentGender === 'PREFER_NOT_TO_SAY' && user?.genderIsSet === true
    );
  }, [open, isJoin, user?.gender, user?.genderIsSet]);

  const canConfirm = isJoin
    ? gender === 'MALE' || gender === 'FEMALE'
    : gender === 'MALE' ||
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
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !isSaving && onClose()} modalId="gender-set-modal">
      <DialogContent className={isJoin ? 'max-w-[20rem] p-4 pt-10' : 'max-w-md p-6 pt-10'}>
        <div className={isJoin ? 'space-y-3' : 'space-y-4'}>
          <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('games.genderPromptModalTitle', { defaultValue: 'Set your gender' })}
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isJoin
              ? t('games.genderPromptJoinSubtitle', {
                  defaultValue: 'This game is for a specific gender. Pick yours so we can add you.',
                })
              : t('games.genderPromptModalSubtitle', { defaultValue: 'This helps us show better game matches and unlock mixed-gender events.' })}
          </p>

          {isJoin ? (
            <div className="grid grid-cols-2 gap-2">
              {JOIN_GENDERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={gender === value}
                  className={joinChoiceClass(gender === value)}
                  onClick={() => setGender(value)}
                >
                  {t(value === 'MALE' ? 'profile.male' : 'profile.female')}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="gender-prompt-prefer-not-to-say-ack" className="ms-2 text-sm text-gray-700 dark:text-gray-300">
                    {t('profile.preferNotToSayAcknowledgment')}
                  </label>
                </div>
              )}
            </>
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
