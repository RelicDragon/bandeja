import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components';
import { Game } from '@/types';
import { chatApi, ChatMessage } from '@/api/chat';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { UrlConstructor } from '@/utils/urlConstructor';
import { capturePhoto } from '@/utils/photoCapture';
import { mediaApi } from '@/api/media';
import { socketService } from '@/services/socketService';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

interface PhotosSectionProps {
  game: Game;
}

export const PhotosSection = ({ game }: PhotosSectionProps) => {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

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

  const handlePhotoCapture = async () => {
    if (isUploadingPhoto || !game.id) return;

    setIsUploadingPhoto(true);
    try {
      const photoResult = await capturePhoto();
      if (!photoResult) {
        setIsUploadingPhoto(false);
        return;
      }

      const uploadResponse = await mediaApi.uploadChatImage(photoResult.file, game.id);
      
      await chatApi.createMessage({
        gameId: game.id,
        chatType: 'PHOTOS',
        mediaUrls: [uploadResponse.originalUrl],
        thumbnailUrls: [uploadResponse.thumbnailUrl],
      });

      toast.success(t('gameDetails.photoAdded'));
      await loadPhotos();
    } catch (error) {
      console.error('Failed to capture and upload photo:', error);
      toast.error(t('gameDetails.photoUploadFailed'));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleImageClick = (imageUrl: string) => {
    setFullscreenImage(UrlConstructor.constructImageUrl(imageUrl));
  };

  const getThumbnailUrl = (message: ChatMessage, index: number): string => {
    if (message.thumbnailUrls && message.thumbnailUrls[index]) {
      return UrlConstructor.constructImageUrl(message.thumbnailUrls[index]);
    }
    return UrlConstructor.constructImageUrl(message.mediaUrls[index]);
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
                  
                  return (
                    <div
                      key={`${message.id}-${mediaIndex}`}
                      className="flex-shrink-0 cursor-pointer group"
                      onClick={() => handleImageClick(mediaUrl)}
                    >
                      <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 group-hover:border-primary-500 dark:group-hover:border-primary-400 transition-colors">
                        <img
                          src={thumbnailUrl}
                          alt={`Photo ${globalIndex + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
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
    </>
  );
};

