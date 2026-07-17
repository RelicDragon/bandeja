import { useEffect, useState } from 'react';
import {
  acquireChatMediaAsset,
  peekChatMediaAsset,
  recordChatMediaDimensions,
  releaseChatMediaAsset,
  type ChatMediaAsset,
} from '@/services/chat/chatMediaAssetCache';

function chatMediaAssetsEqual(a: ChatMediaAsset | null, b: ChatMediaAsset | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.displayUrl !== b.displayUrl) return false;
  if (a.dimensions === b.dimensions) return true;
  return (
    a.dimensions?.width === b.dimensions?.width &&
    a.dimensions?.height === b.dimensions?.height
  );
}

export function useChatMediaAsset(src: string): {
  asset: ChatMediaAsset | null;
  recordDimensions: (width: number, height: number) => void;
} {
  const [asset, setAsset] = useState<ChatMediaAsset | null>(() =>
    peekChatMediaAsset(src)
  );

  useEffect(() => {
    const immediate = peekChatMediaAsset(src);
    setAsset((current) => (chatMediaAssetsEqual(current, immediate) ? current : immediate));
    if (!src) return;

    let cancelled = false;
    void acquireChatMediaAsset(src).then((next) => {
      if (!cancelled) {
        setAsset((current) => (chatMediaAssetsEqual(current, next) ? current : next));
      }
    });
    return () => {
      cancelled = true;
      releaseChatMediaAsset(src);
    };
  }, [src]);

  return {
    asset,
    recordDimensions: (width, height) => {
      recordChatMediaDimensions(src, { width, height });
      setAsset((current) =>
        current &&
        (current.dimensions?.width !== width || current.dimensions?.height !== height)
          ? { ...current, dimensions: { width, height } }
          : current
      );
    },
  };
}
