import { useEffect, useState } from 'react';
import type { StorySlide } from '../types/storyEditor.types';

export function useStoryVideoDuration(
  activeSlide: StorySlide | null,
  onDurationReady: (durationMs: number) => void
) {
  const [videoDurationMs, setVideoDurationMs] = useState(0);

  const slideId = activeSlide?.id;
  const previewUrl = activeSlide?.media.previewUrl;
  const isVideo = activeSlide?.media.type === 'VIDEO';

  useEffect(() => {
    if (!isVideo || !previewUrl) {
      setVideoDurationMs(0);
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = previewUrl;
    const onMeta = () => {
      const ms = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      setVideoDurationMs(ms);
      onDurationReady(ms);
    };
    video.addEventListener('loadedmetadata', onMeta);
    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeAttribute('src');
    };
  }, [isVideo, previewUrl, slideId, onDurationReady]);

  return videoDurationMs;
}
