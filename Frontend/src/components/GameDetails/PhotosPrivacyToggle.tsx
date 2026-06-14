import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Game } from '@/types';
import { gamesApi } from '@/api/games';
import { useAuthStore } from '@/store/authStore';
import { canConfigureGamePhotosPrivacy } from '@shared/gamePhotos/permissions';

type PhotosPrivacyToggleProps = {
  game: Game;
  onGameUpdate?: (game: Game) => void;
  className?: string;
};

export function PhotosPrivacyToggle({ game, onGameUpdate, className }: PhotosPrivacyToggleProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [isSaving, setIsSaving] = useState(false);

  const viewer = user ? { id: user.id, isAdmin: user.isAdmin } : null;
  const canConfigure = canConfigureGamePhotosPrivacy(game, viewer);

  if (!canConfigure) return null;

  const checked = game.forbidOthersPhotosView === true;

  const handleToggle = async () => {
    if (!game.id || isSaving) return;
    setIsSaving(true);
    const next = !checked;
    try {
      const response = await gamesApi.update(game.id, { forbidOthersPhotosView: next });
      if (response.data) {
        onGameUpdate?.(response.data);
      } else {
        onGameUpdate?.({ ...game, forbidOthersPhotosView: next });
      }
      toast.success(t('gameDetails.photosPrivacy.updated'));
    } catch (error) {
      console.error('Failed to update photo privacy:', error);
      toast.error(t('gameDetails.photosPrivacy.updateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={
        className ??
        'px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {t('gameDetails.photosPrivacy.title')}
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {checked
              ? t('gameDetails.photosPrivacy.noteOn')
              : t('gameDetails.photosPrivacy.noteOff')}
          </p>
        </div>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handleToggle()}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            isSaving ? 'opacity-50 cursor-not-allowed' : ''
          } ${checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          aria-pressed={checked}
          aria-label={t('gameDetails.photosPrivacy.title')}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
