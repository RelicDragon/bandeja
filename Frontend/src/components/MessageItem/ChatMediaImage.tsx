import React from 'react';
import { useChatMediaAsset } from '@/hooks/useChatMediaAsset';

type ChatMediaImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  loading?: 'lazy' | 'eager';
};

export const ChatMediaImage: React.FC<ChatMediaImageProps> = ({
  src,
  alt,
  className,
  style,
  onClick,
  loading = 'lazy',
}) => {
  const { asset, recordDimensions } = useChatMediaAsset(src);

  return (
    <img
      src={asset?.displayUrl}
      width={asset?.dimensions?.width}
      height={asset?.dimensions?.height}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      onLoad={(event) => {
        const image = event.currentTarget;
        recordDimensions(image.naturalWidth, image.naturalHeight);
      }}
      loading={loading}
    />
  );
};
