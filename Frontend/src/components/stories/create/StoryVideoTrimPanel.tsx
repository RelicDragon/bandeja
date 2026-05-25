import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { formatDurationClock } from '@/components/audio/audioWaveformUtils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { resolveAppLocale } from '@/utils/displayPreferences';
import type { VideoTrimRange } from './types/storyEditor.types';

type StoryVideoTrimPanelProps = {
  previewUrl: string;
  durationMs: number;
  trim: VideoTrimRange;
  onLiveChange: (trim: VideoTrimRange) => void;
  onCommit: (trim: VideoTrimRange) => void;
  onEscape?: () => void;
  disabled?: boolean;
};

export function StoryVideoTrimPanel({
  previewUrl,
  durationMs,
  trim,
  onLiveChange,
  onCommit,
  onEscape,
  disabled = false,
}: StoryVideoTrimPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = useMemo(() => resolveAppLocale(i18n.language), [i18n.language]);
  const formatMs = useCallback((ms: number) => formatDurationClock(ms, locale), [locale]);
  const trapRef = useFocusTrap(true, onEscape);
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxMs = Math.max(1000, durationMs);

  const range = useMemo(
    () => [trim.startMs, trim.endMs > 0 ? trim.endMs : maxMs] as [number, number],
    [trim.startMs, trim.endMs, maxMs]
  );

  const playTrimLoop = useCallback(
    (startMs: number, _endMs: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = startMs / 1000;
      void video.play().catch(() => {});
    },
    []
  );

  useEffect(() => {
    playTrimLoop(range[0], range[1]);
  }, [playTrimLoop, previewUrl, range]);

  const applyRange = (values: number | number[]) => {
    const [startMs, endMs] = values as number[];
    const minGap = 500;
    const start = Math.max(0, Math.min(startMs, maxMs - minGap));
    const end = Math.max(start + minGap, Math.min(endMs, maxMs));
    return { startMs: start, endMs: end };
  };

  const handleRange = (values: number | number[]) => {
    const next = applyRange(values);
    onLiveChange(next);
    playTrimLoop(next.startMs, next.endMs);
  };

  const handleRangeComplete = (values: number | number[]) => {
    onCommit(applyRange(values));
  };

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('stories.editor.toolTrim')}
      className="px-4 py-3 space-y-2"
    >
      <p className="text-xs text-white/70 text-center">{t('stories.editor.trimHint')}</p>
      <video
        ref={videoRef}
        src={previewUrl}
        className="hidden"
        muted
        playsInline
        preload="metadata"
        onTimeUpdate={() => {
          const video = videoRef.current;
          if (!video) return;
          const endSec = range[1] / 1000;
          if (video.currentTime >= endSec) {
            video.currentTime = range[0] / 1000;
            void video.play().catch(() => {});
          }
        }}
      />
      <Slider
        range
        min={0}
        max={maxMs}
        step={100}
        value={range}
        onChange={handleRange}
        onChangeComplete={handleRangeComplete}
        disabled={disabled}
      />
      <div className="flex justify-between text-xs text-white/80">
        <span>{formatMs(range[0])}</span>
        <span>{formatMs(range[1])}</span>
      </div>
    </div>
  );
}
