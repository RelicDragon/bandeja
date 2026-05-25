import type { StorySegment } from '@/api/stories';

type StoriesProgressBarsProps = {
  segments: StorySegment[];
  activeIndex: number;
  progress: number;
};

export function StoriesProgressBars({
  segments,
  activeIndex,
  progress,
}: StoriesProgressBarsProps) {
  if (segments.length === 0) return null;
  return (
    <div className="flex gap-1 px-3 pt-2 pointer-events-none" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}>
      {segments.map((seg, i) => {
        const fill = i < activeIndex ? 1 : i === activeIndex ? progress : 0;
        return (
          <div key={seg.key} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full w-full origin-left bg-white"
              style={{ transform: `scaleX(${fill})` }}
            />
          </div>
        );
      })}
    </div>
  );
}
