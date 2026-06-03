import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { gamePhotosApi } from '@/api/gamePhotos';
import { gamesApi } from '@/api/games';
import { useAuthStore } from '@/store/authStore';
import { useGamePhotosStore } from '@/store/gamePhotosStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import type { Game } from '@/types';

function newClientUploadId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function usePhotosSectionUpload(
  game: Game,
  onGameUpdate?: (game: Game) => void,
  onMainPhotoIdChange?: (photoId: string) => void
) {
  const { t } = useTranslation();
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const addPhotoLocal = useGamePhotosStore((s) => s.addPhotoLocal);

  const refreshGame = useCallback(async () => {
    if (!onGameUpdate || !game.id) return;
    try {
      const updatedGameResponse = await gamesApi.getById(game.id);
      if (updatedGameResponse.data) {
        onGameUpdate(updatedGameResponse.data);
      }
    } catch (error) {
      console.error('Failed to fetch updated game:', error);
    }
  }, [game.id, onGameUpdate]);

  const handlePhotoSelect = useCallback(
    async (files: File[]) => {
      if (!files.length || isUploadingPhoto || !game.id) return;

      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        runWithProfileName(() => void handlePhotoSelect(files));
        return;
      }

      const imageFiles = files.filter(
        (file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024
      );

      if (imageFiles.length === 0) {
        toast.error(t('chat.invalidImageType'));
        return;
      }

      setIsUploadingPhoto(true);
      let successCount = 0;
      let failCount = 0;

      try {
        for (const file of imageFiles) {
          const tempId = newClientUploadId();
          try {
            const photo = await gamePhotosApi.upload(game.id, file, { clientUploadId: tempId });
            addPhotoLocal(game.id, photo);
            onMainPhotoIdChange?.(photo.id);
            successCount++;
          } catch (error) {
            console.error(`Failed to upload photo ${file.name}:`, error);
            failCount++;
          }
        }

        if (successCount > 0) {
          toast.success(
            successCount === 1
              ? t('gameDetails.photoAdded')
              : t('gameDetails.photosAdded', { count: successCount })
          );
          await refreshGame();
        }

        if (failCount > 0) {
          toast.error(
            failCount === 1
              ? t('gameDetails.photoUploadFailed')
              : t('gameDetails.somePhotosFailed', { count: failCount })
          );
        }
      } catch (error) {
        console.error('Failed to upload photos:', error);
        if (successCount === 0) {
          toast.error(t('gameDetails.photoUploadFailed'));
        }
      } finally {
        setIsUploadingPhoto(false);
      }
    },
    [addPhotoLocal, game.id, isUploadingPhoto, onMainPhotoIdChange, refreshGame, t]
  );

  return { isUploadingPhoto, handlePhotoSelect };
}
