import { useEffect, useRef, useState } from 'react';
import { formatDurationClock } from '@/components/audio/audioWaveformUtils';

type StoryVideoPreviewProps = {
  videoUrl: string;
  posterUrl?: string;
  durationMs?: number;
  className?: string;
};

export function StoryVideoPreview({
  videoUrl,
  posterUrl,
  durationMs = 0,
  className = 'h-full w-full object-cover',
}: StoryVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.loop = true;
    void el.play().catch(() => {});
  }, [videoUrl]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {!loaded && posterUrl ? (
        <img src={posterUrl} alt="" className={`absolute inset-0 ${className}`} />
      ) : null}
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl}
        muted
        loop
        playsInline
        preload="auto"
        className={className}
        onLoadedData={() => setLoaded(true)}
      />
      {durationMs > 0 ? (
        <span className="absolute bottom-3 right-3 text-[11px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] pointer-events-none">
          {formatDurationClock(durationMs)}
        </span>
      ) : null}
    </div>
  );
}
