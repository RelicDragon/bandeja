import { useEffect, useState } from 'react';
import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import { mediaCacheKeyForSrc, readCachedMediaResponse } from '@/services/chat/chatMediaCache';

export function useChatVideoPlaybackUrl(src: string, enabled: boolean): string {
  const resolved = resolveChatMediaUrl(src);
  const [playbackUrl, setPlaybackUrl] = useState(resolved);

  useEffect(() => {
    setPlaybackUrl(resolved);
  }, [resolved]);

  useEffect(() => {
    if (!enabled || !resolved || resolved.startsWith('blob:') || resolved.startsWith('data:')) {
      return;
    }
    const key = mediaCacheKeyForSrc(resolved);
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const hit = await readCachedMediaResponse(key);
        if (cancelled || !hit?.ok) return;
        const blob = await hit.blob();
        const u = URL.createObjectURL(blob);
        revoked = u;
        setPlaybackUrl(u);
      } catch {
        /* keep network src */
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [enabled, resolved]);

  return playbackUrl;
}
