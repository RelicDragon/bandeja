import React from 'react';
import { useTranslation } from 'react-i18next';

type ChatMediaUnavailableProps = {
  className?: string;
  style?: React.CSSProperties;
};

export const ChatMediaUnavailable: React.FC<ChatMediaUnavailableProps> = ({ className, style }) => {
  const { t } = useTranslation();
  return (
    <div
      role="img"
      aria-label={t('chat.mediaUnavailable', { defaultValue: 'Photo unavailable' })}
      className={`flex items-center justify-center bg-black/10 dark:bg-white/10 ${className ?? ''}`}
      style={{ minHeight: 120, borderRadius: 12, ...style }}
    />
  );
};
