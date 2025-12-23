import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components';
import { Game } from '@/types';
import { chatApi, ChatMessage } from '@/api/chat';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { mediaApi } from '@/api/media';
import { socketService } from '@/services/socketService';
import { gamesApi } from '@/api/games';
import { useAuthStore } from '@/store/authStore';
import { isUserGameAdminOrOwner } from '@/utils/gameResults';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

interface PhotosSectionProps {
  game: Game;
  onGameUpdate?: (game: Game) => void;
}

export const PhotosSection = ({ game, onGameUpdate }: PhotosSectionProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [photos, setPhotos] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isUpdatingMainPhoto, setIsUpdatingMainPhoto] = useState(false);
  const [mainPhotoId, setMainPhotoId] = useState<string | null | undefined>(game.mainPhotoId);
  const hasAttemptedSetMainPhoto = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const canEditMainPhoto = user ? isUserGameAdminOrOwner(game, user.id) : false;

  useEffect(() => {
    setMainPhotoId(game.mainPhotoId);
  }, [game.mainPhotoId]);

  const loadPhotos = useCallback(async () => {
    if (!game.id) return;
    
    setIsLoading(true);
    try {
      const allMessages: ChatMessage[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const messages = await chatApi.getGameMessages(game.id, page, 50, 'PHOTOS');
        const photoMessages = messages.filter(
          msg => !msg.content && msg.mediaUrls && msg.mediaUrls.length > 0
        );
        allMessages.push(...photoMessages);
        
        if (messages.length < 50) {
          hasMore = false;
        } else {
          page++;
        }
      }
      
      setPhotos(allMessages);
      hasAttemptedSetMainPhoto.current = false;
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    if (game.status !== 'ANNOUNCED') {
      loadPhotos();
    }
  }, [game.status, loadPhotos]);

  useEffect(() => {
    if (!game.id || game.status === 'ANNOUNCED') return;

    const handleNewMessage = (message: ChatMessage) => {
      if (message.chatType === 'PHOTOS' && !message.content && message.mediaUrls && message.mediaUrls.length > 0) {
        setPhotos(prevPhotos => {
          const exists = prevPhotos.some(msg => msg.id === message.id);
          if (exists) return prevPhotos;
          return [message, ...prevPhotos];
        });
      }
    };

    const handleMessageDeleted = (data: { messageId: string }) => {
      setPhotos(prevPhotos => prevPhotos.filter(msg => msg.id !== data.messageId));
    };

    socketService.on('new-message', handleNewMessage);
    socketService.on('message-deleted', handleMessageDeleted);

    return () => {
      socketService.off('new-message', handleNewMessage);
      socketService.off('message-deleted', handleMessageDeleted);
    };
  }, [game.id, game.status]);

  const handlePhotoSelect = async (files: FileList | null) => {
    if (!files || files.length === 0 || isUploadingPhoto || !game.id) return;

    const imageFiles = Array.from(files).filter(file => 
      file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024
    );

    if (imageFiles.length === 0) {
      toast.error(t('chat.invalidImageType'));
      return;
    }

    setIsUploadingPhoto(true);
    try {
      for (const file of imageFiles) {
        const uploadResponse = await mediaApi.uploadChatImage(file, game.id, 'GAME');
        
        await chatApi.createMessage({
          gameId: game.id,
          chatType: 'PHOTOS',
          mediaUrls: [uploadResponse.originalUrl],
          thumbnailUrls: [uploadResponse.thumbnailUrl],
        });
      }

      toast.success(t('gameDetails.photoAdded'));
      await loadPhotos();
    } catch (error) {
      console.error('Failed to upload photo:', error);
      toast.error(t('gameDetails.photoUploadFailed'));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoCapture = () => {
    if (isUploadingPhoto || !game.id) return;
    fileInputRef.current?.click();
  };

  const handleImageClick = (imageUrl: string) => {
    setFullscreenImage(imageUrl || '');
  };

  const handleMainPhotoSelect = useCallback(async (messageId: string, silent = false) => {
    if (!game.id || isUpdatingMainPhoto || !canEditMainPhoto) return;

    if (mainPhotoId === messageId) {
      return;
    }
    
    setIsUpdatingMainPhoto(true);
    try {
      const response = await gamesApi.update(game.id, { mainPhotoId: messageId });
      setMainPhotoId(response.data.mainPhotoId);
      if (onGameUpdate && response.data) {
        onGameUpdate(response.data);
      }
      if (!silent) {
        toast.success(t('gameDetails.mainPhotoUpdated'));
      }
    } catch (error) {
      console.error('Failed to update main photo:', error);
      if (!silent) {
        toast.error(t('gameDetails.mainPhotoUpdateFailed'));
      }
    } finally {
      setIsUpdatingMainPhoto(false);
    }
  }, [game.id, mainPhotoId, isUpdatingMainPhoto, canEditMainPhoto, t, onGameUpdate]);


  useEffect(() => {
    if (
      photos.length > 0 && 
      !mainPhotoId && 
      canEditMainPhoto && 
      !isUpdatingMainPhoto && 
      !hasAttemptedSetMainPhoto.current
    ) {
      const firstPhoto = photos[0];
      if (firstPhoto) {
        hasAttemptedSetMainPhoto.current = true;
        handleMainPhotoSelect(firstPhoto.id, true);
      }
    }
  }, [photos, mainPhotoId, canEditMainPhoto, isUpdatingMainPhoto, handleMainPhotoSelect]);

  const getThumbnailUrl = (message: ChatMessage, index: number): string => {
    if (message.thumbnailUrls && message.thumbnailUrls[index]) {
      return message.thumbnailUrls[index] || '';
    }
    return message.mediaUrls[index] || '';
  };

  if (game.status === 'ANNOUNCED') {
    return null;
  }

  if (isLoading) {
    return null;
  }

  if (photos.length === 0) {
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
      <Card>
        <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {t(getNoPhotosKey())}
            </span>
            <button
              onClick={handlePhotoCapture}
              disabled={isUploadingPhoto}
              className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors active:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('gameDetails.addPhoto')}
            >
              <Camera size={20} className="text-white" />
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="p-0">
          <div className="overflow-x-auto -mx-0.5 px-0.5">
            <div className="flex gap-3 pb-0.5">
              {photos.map((message, messageIndex) => 
                message.mediaUrls?.map((mediaUrl, mediaIndex) => {
                  const thumbnailUrl = getThumbnailUrl(message, mediaIndex);
                  const globalIndex = photos.slice(0, messageIndex).reduce(
                    (acc, msg) => acc + (msg.mediaUrls?.length || 0), 0
                  ) + mediaIndex;
                  const isMainPhoto = mainPhotoId === message.id;
                  
                  return (
                    <div
                      key={`${message.id}-${mediaIndex}`}
                      className="flex-shrink-0"
                    >
                      <div className={`relative w-24 h-24 rounded-lg overflow-hidden border-2 transition-colors cursor-pointer group ${
                        isMainPhoto 
                          ? 'border-blue-500 dark:border-blue-400' 
                          : 'border-gray-200 dark:border-gray-700 group-hover:border-primary-500 dark:group-hover:border-primary-400'
                      }`}
                        onClick={() => handleImageClick(mediaUrl)}
                      >
                        <img
                          src={thumbnailUrl}
                          alt={`Photo ${globalIndex + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {canEditMainPhoto && photos.length >= 2 && (
                        <div className="mt-1 flex items-center justify-center">
                          <input
                            type="radio"
                            name="mainPhoto"
                            checked={isMainPhoto}
                            onChange={() => handleMainPhotoSelect(message.id)}
                            disabled={isUpdatingMainPhoto || (isMainPhoto && photos.length > 0)}
                            className="cursor-pointer disabled:opacity-50"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div className="flex-shrink-0">
                <button
                  onClick={handlePhotoCapture}
                  disabled={isUploadingPhoto}
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

      {fullscreenImage && (
        <FullscreenImageViewer
          imageUrl={fullscreenImage}
          onClose={() => setFullscreenImage(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handlePhotoSelect(e.target.files)}
        className="hidden"
      />
    </>
  );
};

