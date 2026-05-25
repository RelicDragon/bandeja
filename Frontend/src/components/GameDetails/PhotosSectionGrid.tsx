import { Camera, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import type { GamePhoto } from '@/api/gamePhotos';
import { gamePhotoUrl } from '@/utils/gamePhotoUrl';

type PhotosSectionGridProps = {
  photos: GamePhoto[];
  mainPhotoId: string | null | undefined;
  canEditMainPhoto: boolean;
  canDeletePhoto: (photo: GamePhoto) => boolean;
  isUploadingPhoto: boolean;
  isUpdatingMainPhoto: boolean;
  gameId: string;
  onImageClick: (index: number) => void;
  onMainPhotoSelect: (photoId: string) => void;
  onDeleteClick: (photo: GamePhoto) => void;
  onPhotoCapture: (e: React.MouseEvent) => void;
};

export const PhotosSectionGrid = ({
  photos,
  mainPhotoId,
  canEditMainPhoto,
  canDeletePhoto,
  isUploadingPhoto,
  isUpdatingMainPhoto,
  gameId,
  onImageClick,
  onMainPhotoSelect,
  onDeleteClick,
  onPhotoCapture,
}: PhotosSectionGridProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="p-0">
        <div className="overflow-x-auto -mx-0.5 px-0.5">
          <div className="flex gap-3 pb-2">
            {photos.map((photo, index) => {
              const isMainPhoto = mainPhotoId === photo.id;
              const showDelete = canDeletePhoto(photo);

              return (
                <div key={photo.id} className="flex-shrink-0">
                  <div
                    className={`relative w-24 h-24 rounded-lg overflow-hidden border-2 transition-colors cursor-pointer group ${
                      isMainPhoto
                        ? 'border-blue-500 dark:border-blue-400'
                        : 'border-gray-200 dark:border-gray-700 group-hover:border-primary-500 dark:group-hover:border-primary-400'
                    }`}
                    onClick={() => onImageClick(index)}
                  >
                    <img
                      src={gamePhotoUrl(photo)}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {showDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteClick(photo);
                        }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                        aria-label={t('gameDetails.deletePhoto')}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {canEditMainPhoto && photos.length >= 2 && (
                    <div className="mt-1 flex items-center justify-center">
                      <input
                        type="radio"
                        name="mainPhoto"
                        checked={isMainPhoto}
                        onChange={() => onMainPhotoSelect(photo.id)}
                        disabled={isUpdatingMainPhoto}
                        className="cursor-pointer disabled:opacity-50"
                        onClick={(e) => e.stopPropagation()}
                        title={t('gameDetails.setAsMainPhoto')}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex-shrink-0">
              <button
                onClick={onPhotoCapture}
                disabled={isUploadingPhoto || !gameId}
                className="w-24 h-24 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors active:scale-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                title={t('gameDetails.addPhoto')}
              >
                <Camera size={24} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
