import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import { gamesApi } from '@/api/games';
import {
  filterGamePhotoUploadFiles,
  uploadGamePhotoFileWithRetry,
} from '@/services/gamePhotoUploadRetry';
import { useAuthStore } from '@/store/authStore';
import { useGamePhotosStore } from '@/store/gamePhotosStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { mergeGamePhotoRefresh } from '@/utils/gameResultsArtifacts.util';
import type { Game } from '@/types';

function newClientUploadId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function usePhotosSectionUpload(
  game: Game,
  getLatestGame: () => Game,
  onGameUpdate?: (game: Game) => void,
  onMainPhotoIdChange?: (photoId: string) => void,
  canUpload = true
) {
  const { t } = useTranslation();
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const addPhotoLocal = useGamePhotosStore((s) => s.addPhotoLocal);

  const refreshGame = useCallback(async () => {
    if (!onGameUpdate || !game.id) return;
    try {
      const updatedGameResponse = await gamesApi.getById(game.id);
      if (updatedGameResponse.data) {
        const latest = getLatestGame();
        onGameUpdate(mergeGamePhotoRefresh(latest, updatedGameResponse.data));
      }
    } catch (error) {
      console.error('Failed to fetch updated game:', error);
    }
  }, [game.id, getLatestGame, onGameUpdate]);

  const handlePhotoSelect = useCallback(
    async (files: File[]) => {
      if (!files.length || isUploadingPhoto || !game.id || !canUpload) return;

      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        runWithProfileName(() => void handlePhotoSelect(files));
        return;
      }

      const imageFiles = filterGamePhotoUploadFiles(files);

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
            const photo = await uploadGamePhotoFileWithRetry(game.id, file, tempId);
            addPhotoLocal(game.id, photo);
            onMainPhotoIdChange?.(photo.id);
            successCount++;
          } catch (error) {
            const detail = isAxiosError(error)
              ? `${error.response?.status ?? 'network'} ${JSON.stringify(error.response?.data ?? error.message)}`
              : error instanceof Error
                ? error.message
                : String(error);
            console.error(`Failed to upload photo ${file.name}:`, detail, error);
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
    [addPhotoLocal, canUpload, game.id, isUploadingPhoto, onMainPhotoIdChange, refreshGame, t]
  );

  return { isUploadingPhoto, handlePhotoSelect };
}
