import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card } from '@/components';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Game } from '@/types';
import { gamePhotosApi, type GamePhoto } from '@/api/gamePhotos';
import { gamesApi } from '@/api/games';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useGamePhotosStore } from '@/store/gamePhotosStore';
import { useAuthStore } from '@/store/authStore';
import { isUserGameAdminOrOwner } from '@/utils/gameResults';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { pickImages } from '@/utils/photoCapture';
import { isCapacitor } from '@/utils/capacitor';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { PhotosSectionGrid } from './PhotosSectionGrid';
import { usePhotosSectionUpload } from './usePhotosSectionUpload';
import { gamePhotoUrl } from '@/utils/gamePhotoUrl';

interface PhotosSectionProps {
  game: Game;
  onGameUpdate?: (game: Game) => void;
}

export const PhotosSection = ({ game, onGameUpdate }: PhotosSectionProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const lastGamePhotoDeleted = useSocketEventsStore((state) => state.lastGamePhotoDeleted);
  const lastGamePhotoMainChanged = useSocketEventsStore((state) => state.lastGamePhotoMainChanged);

  const photos = useGamePhotosStore((s) => s.byGameId[game.id]?.photos ?? []);
  const isLoading = useGamePhotosStore((s) => s.byGameId[game.id]?.isLoading ?? false);
  const loaded = useGamePhotosStore((s) => s.byGameId[game.id]?.loaded ?? false);
  const loadGamePhotos = useGamePhotosStore((s) => s.loadGamePhotos);
  const removePhotoLocal = useGamePhotosStore((s) => s.removePhotoLocal);

  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [isUpdatingMainPhoto, setIsUpdatingMainPhoto] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<GamePhoto | null>(null);
  const [mainPhotoId, setMainPhotoId] = useState<string | null | undefined>(game.mainPhotoId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayMainPhotoId = useMemo(() => {
    if (!mainPhotoId) return null;
    return photos.some((p) => p.id === mainPhotoId) ? mainPhotoId : null;
  }, [mainPhotoId, photos]);

  const { isUploadingPhoto, handlePhotoSelect } = usePhotosSectionUpload(game, onGameUpdate);

  const canEditMainPhoto = user ? isUserGameAdminOrOwner(game, user.id) : false;

  const canDeletePhoto = useCallback(
    (photo: GamePhoto) => {
      if (!user) return false;
      if (isUserGameAdminOrOwner(game, user.id)) return true;
      return photo.uploader?.id === user.id;
    },
    [game, user]
  );

  useEffect(() => {
    setMainPhotoId(game.mainPhotoId);
  }, [game.mainPhotoId]);

  useEffect(() => {
    setGalleryIndex(null);
    setFullscreenImage(null);
  }, [game.id]);

  useEffect(() => {
    if (game.status === 'ANNOUNCED' || !user || !game.id) return;
    if (loaded || isLoading) return;
    loadGamePhotos(game.id).catch((error: { response?: { status?: number } }) => {
      if (error?.response?.status !== 401) {
        console.error('Failed to load photos:', error);
      }
    });
  }, [game.id, game.status, isLoading, loadGamePhotos, loaded, user]);

  useEffect(() => {
    if (!game.id || game.status === 'ANNOUNCED') return;
    if (!lastGamePhotoDeleted || lastGamePhotoDeleted.gameId !== game.id) return;
    setMainPhotoId(lastGamePhotoDeleted.mainPhotoId);
    if (
      onGameUpdate &&
      (game.mainPhotoId !== lastGamePhotoDeleted.mainPhotoId || game.photosCount !== lastGamePhotoDeleted.photosCount)
    ) {
      onGameUpdate({
        ...game,
        mainPhotoId: lastGamePhotoDeleted.mainPhotoId,
        photosCount: lastGamePhotoDeleted.photosCount,
      });
    }
  }, [
    game,
    game.id,
    game.mainPhotoId,
    game.photosCount,
    game.status,
    lastGamePhotoDeleted,
    onGameUpdate,
  ]);

  useEffect(() => {
    if (!game.id || game.status === 'ANNOUNCED') return;
    if (!lastGamePhotoMainChanged || lastGamePhotoMainChanged.gameId !== game.id) return;
    setMainPhotoId(lastGamePhotoMainChanged.mainPhotoId);
    if (onGameUpdate && game.mainPhotoId !== lastGamePhotoMainChanged.mainPhotoId) {
      onGameUpdate({ ...game, mainPhotoId: lastGamePhotoMainChanged.mainPhotoId });
    }
  }, [game, game.id, game.mainPhotoId, game.status, lastGamePhotoMainChanged, onGameUpdate]);

  const handlePhotoCapture = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploadingPhoto || !game.id) return;

    if (isCapacitor()) {
      try {
        const result = await pickImages(10);
        if (result && result.files.length > 0) {
          await handlePhotoSelect(result.files);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '';
        console.error('Error picking images:', error);
        if (message.includes('too large')) {
          toast.error(message);
        } else {
          toast.error(t('gameDetails.photoPickFailed') || 'Failed to pick photos');
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleMainPhotoSelect = useCallback(
    async (photoId: string) => {
      if (!game.id || isUpdatingMainPhoto || !canEditMainPhoto) return;
      if (!photos.some((p) => p.id === photoId)) return;
      if (displayMainPhotoId === photoId) return;

      setIsUpdatingMainPhoto(true);
      try {
        const result = await gamePhotosApi.setMain(game.id, photoId);
        setMainPhotoId(result.mainPhotoId);
        if (onGameUpdate) {
          const updatedGameResponse = await gamesApi.getById(game.id);
          if (updatedGameResponse.data) {
            onGameUpdate(updatedGameResponse.data);
          }
        }
        toast.success(t('gameDetails.mainPhotoUpdated'));
      } catch (error) {
        console.error('Failed to update main photo:', error);
        toast.error(t('gameDetails.mainPhotoUpdateFailed'));
      } finally {
        setIsUpdatingMainPhoto(false);
      }
    },
    [canEditMainPhoto, displayMainPhotoId, game.id, isUpdatingMainPhoto, onGameUpdate, photos, t]
  );

  const handleDeleteConfirm = async () => {
    if (!photoToDelete || !game.id || isDeletingPhoto) return;
    setIsDeletingPhoto(true);
    try {
      await gamePhotosApi.delete(game.id, photoToDelete.id);
      removePhotoLocal(game.id, photoToDelete.id);
      toast.success(t('gameDetails.photoDeleted'));
      try {
        const updatedGameResponse = await gamesApi.getById(game.id);
        if (updatedGameResponse.data) {
          setMainPhotoId(updatedGameResponse.data.mainPhotoId);
          onGameUpdate?.(updatedGameResponse.data);
        }
      } catch (refreshError) {
        console.error('Failed to refresh game after photo delete:', refreshError);
      }
    } catch (error) {
      console.error('Failed to delete photo:', error);
      toast.error(t('gameDetails.photoDeleteFailed'));
    } finally {
      setIsDeletingPhoto(false);
      setPhotoToDelete(null);
    }
  };

  const visiblePhotos = useMemo(() => photos.filter((p) => gamePhotoUrl(p)), [photos]);

  const galleryImages = useMemo(() => visiblePhotos.map(gamePhotoUrl), [visiblePhotos]);

  const handleImageClick = useCallback(
    (photoIndex: number) => {
      const photo = photos[photoIndex];
      if (!photo) return;
      const gi = visiblePhotos.findIndex((p) => p.id === photo.id);
      if (gi < 0) return;
      const url = galleryImages[gi];
      if (!url) return;
      setGalleryIndex(gi);
      setFullscreenImage(url);
    },
    [photos, visiblePhotos, galleryImages]
  );

  const closeFullscreen = useCallback(() => {
    setFullscreenImage(null);
    setGalleryIndex(null);
  }, []);

  useEffect(() => {
    if (galleryIndex == null || !fullscreenImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && galleryIndex > 0) {
        const next = galleryIndex - 1;
        setGalleryIndex(next);
        setFullscreenImage(galleryImages[next] ?? null);
      }
      if (e.key === 'ArrowRight' && galleryIndex < galleryImages.length - 1) {
        const next = galleryIndex + 1;
        setGalleryIndex(next);
        setFullscreenImage(galleryImages[next] ?? null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreenImage, galleryIndex, galleryImages]);

  if (game.status === 'ANNOUNCED' || !user) {
    return null;
  }

  if (isLoading && !loaded) {
    return null;
  }

  const getNoPhotosKey = () => {
    switch (game.entityType) {
      case 'GAME':
        return 'gameDetails.noPhotosYetFromGame';
      case 'TOURNAMENT':
        return 'gameDetails.noPhotosYetFromTournament';
      case 'LEAGUE':
        return 'gameDetails.noPhotosYetFromLeague';
      case 'BAR':
        return 'gameDetails.noPhotosYetFromBar';
      case 'TRAINING':
        return 'gameDetails.noPhotosYetFromTraining';
      default:
        return 'gameDetails.noPhotosYet';
    }
  };

  return (
    <>
      {photos.length === 0 ? (
        <Card>
          <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t(getNoPhotosKey())}
              </span>
              <button
                onClick={handlePhotoCapture}
                disabled={isUploadingPhoto || !game.id}
                className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors active:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('gameDetails.addPhoto')}
              >
                <Camera size={20} className="text-white" />
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <PhotosSectionGrid
          photos={photos}
          mainPhotoId={displayMainPhotoId}
          canEditMainPhoto={canEditMainPhoto}
          canDeletePhoto={canDeletePhoto}
          isUploadingPhoto={isUploadingPhoto}
          isUpdatingMainPhoto={isUpdatingMainPhoto}
          gameId={game.id}
          onImageClick={handleImageClick}
          onMainPhotoSelect={(photoId) => void handleMainPhotoSelect(photoId)}
          onDeleteClick={setPhotoToDelete}
          onPhotoCapture={handlePhotoCapture}
        />
      )}

      {fullscreenImage && (
        <FullscreenImageViewer
          imageUrl={fullscreenImage}
          onClose={closeFullscreen}
          isOpen
          enableTransform={false}
          usePortaledOverlay
          modalId="fullscreen-game-photo-viewer"
        />
      )}

      <ConfirmationModal
        isOpen={!!photoToDelete}
        onClose={() => setPhotoToDelete(null)}
        onConfirm={() => void handleDeleteConfirm()}
        title={t('gameDetails.deletePhoto')}
        message={t('gameDetails.confirmDeletePhoto')}
        confirmText={t('gameDetails.deletePhoto')}
        confirmVariant="danger"
        isLoading={isDeletingPhoto}
        closeOnConfirm={false}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (files) {
            void handlePhotoSelect(Array.from(files));
          }
          e.target.value = '';
        }}
        className="hidden"
      />
    </>
  );
};
