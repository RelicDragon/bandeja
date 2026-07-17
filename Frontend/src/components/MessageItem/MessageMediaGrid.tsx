import React from 'react';
import { useTranslation } from 'react-i18next';
import { getImageGridLayout } from './utils';
import { ChatMediaImage } from './ChatMediaImage';

interface MessageMediaGridProps {
  mediaUrls: string[];
  getThumbnailUrl: (index: number) => string;
  onImageClick: (url: string) => void;
  hasContentBelow?: boolean;
  loadEager?: boolean;
  /** Lone GIF: round the asset itself, no bubble chrome. */
  floating?: boolean;
}

export const MessageMediaGrid: React.FC<MessageMediaGridProps> = ({
  mediaUrls,
  getThumbnailUrl,
  onImageClick,
  hasContentBelow = false,
  loadEager = false,
  floating = false,
}) => {
  const { t } = useTranslation();
  const layout = getImageGridLayout(mediaUrls.length);

  return (
    <div
      className={floating ? 'w-auto max-w-[280px]' : 'w-full'}
      style={{
        display: 'grid',
        ...layout,
        marginBottom: hasContentBelow ? '8px' : '0',
      }}
    >
      {mediaUrls.map((url, index) => {
        const isFirstInThreeLayout = layout.firstImageSpan && index === 0;
        const isSingleImage = layout.singleImage;

        return (
          <button
            key={index}
            type="button"
            aria-label={
              floating
                ? t('chat.giphy.openGif', { defaultValue: 'Open GIF' })
                : t('chat.giphy.openMedia', {
                    defaultValue: 'Open media {{number}}',
                    number: index + 1,
                  })
            }
            className={`relative overflow-hidden ${floating ? 'rounded-xl' : ''}`}
            style={{
              gridColumn: isFirstInThreeLayout ? '1 / -1' : 'auto',
              aspectRatio: isSingleImage ? undefined : (isFirstInThreeLayout ? '16/9' : '1'),
              maxHeight: isSingleImage ? '400px' : undefined,
              cursor: 'pointer',
              padding: 0,
              border: 0,
              background: 'transparent',
              textAlign: 'left',
            }}
            onClick={() => onImageClick(floating ? getThumbnailUrl(index) : url)}
          >
            <ChatMediaImage
              src={getThumbnailUrl(index)}
              alt={`Media ${index + 1}`}
              className={
                floating
                  ? 'w-full h-auto object-contain bg-transparent'
                  : isSingleImage
                    ? 'w-full h-auto object-cover'
                    : 'w-full h-full object-cover'
              }
              style={{ display: 'block', maxHeight: isSingleImage ? '400px' : undefined }}
              loading={loadEager ? 'eager' : 'lazy'}
            />
          </button>
        );
      })}
    </div>
  );
};
