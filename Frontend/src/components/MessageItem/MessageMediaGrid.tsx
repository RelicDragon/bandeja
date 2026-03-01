import React from 'react';
import { getImageGridLayout } from './utils';

interface MessageMediaGridProps {
  mediaUrls: string[];
  getThumbnailUrl: (index: number) => string;
  onImageClick: (url: string) => void;
  hasContentBelow?: boolean;
}

export const MessageMediaGrid: React.FC<MessageMediaGridProps> = ({
  mediaUrls,
  getThumbnailUrl,
  onImageClick,
  hasContentBelow = false,
}) => {
  const layout = getImageGridLayout(mediaUrls.length);

  return (
    <div
      className="w-full"
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
          <div
            key={index}
            className="relative overflow-hidden"
            style={{
              gridColumn: isFirstInThreeLayout ? '1 / -1' : 'auto',
              aspectRatio: isSingleImage ? undefined : (isFirstInThreeLayout ? '16/9' : '1'),
              maxHeight: isSingleImage ? '400px' : undefined,
              cursor: 'pointer',
            }}
            onClick={() => onImageClick(url)}
          >
            <img
              src={getThumbnailUrl(index)}
              alt={`Media ${index + 1}`}
              className={isSingleImage ? 'w-full h-auto object-cover' : 'w-full h-full object-cover'}
              style={{ display: 'block', maxHeight: isSingleImage ? '400px' : undefined }}
            />
          </div>
        );
      })}
    </div>
  );
};
