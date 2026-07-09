import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Loader2, Phone } from 'lucide-react';
import { Button, ConfirmationModal } from '@/components';
import { usersApi } from '@/api';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import { canRemoveLegacyPhoneAuth, hasLegacyPhoneAuth } from '@/utils/accountAuthMethods';
import type { User } from '@/types';

type LegacyPhoneAuthSectionProps = {
  user: User | null;
  onUserUpdated: (user: User) => void;
};

export function LegacyPhoneAuthSection({ user, onUserUpdated }: LegacyPhoneAuthSectionProps) {
  const { t } = useTranslation();
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  if (!hasLegacyPhoneAuth(user)) {
    return null;
  }

  const canRemove = canRemoveLegacyPhoneAuth(user);

  const handleRemove = async () => {
    try {
      setIsRemoving(true);
      const response = await usersApi.unlinkLegacyPhoneProfile();
      onUserUpdated(response.data.user);
      toast.success(t('profile.legacyPhone.removed'));
      setShowRemoveModal(false);
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, t));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gray-600 dark:bg-gray-500 flex items-center justify-center flex-shrink-0">
            <Phone size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {t('profile.legacyPhone.title')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user?.phone || t('profile.linked')}
            </div>
          </div>
          <Check className="text-green-600 dark:text-green-400 flex-shrink-0" size={20} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {t('profile.legacyPhone.description')}
        </p>
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() => setShowRemoveModal(true)}
            disabled={isRemoving || !canRemove}
            size="sm"
            title={!canRemove ? t('profile.lastAuthMethodHint') : undefined}
          >
            {isRemoving ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              t('profile.legacyPhone.remove')
            )}
          </Button>
        </div>
        {!canRemove && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('profile.lastAuthMethodHint')}
          </p>
        )}
      </div>

      <ConfirmationModal
        isOpen={showRemoveModal}
        onClose={() => {
          if (isRemoving) return;
          setShowRemoveModal(false);
        }}
        onConfirm={handleRemove}
        title={t('profile.legacyPhone.confirmTitle')}
        message={t('profile.legacyPhone.confirmMessage')}
        confirmText={isRemoving ? t('profile.unlinking') : t('profile.legacyPhone.remove')}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
        isLoading={isRemoving}
        closeOnConfirm={false}
      />
    </>
  );
}
