import type { StorySlide } from './types/storyEditor.types';

type StorySlideThumbnailsProps = {
  slides: StorySlide[];
  activeIndex: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
};

export function StorySlideThumbnails({ slides, activeIndex, onSelect, disabled = false }: StorySlideThumbnailsProps) {
  if (slides.length <= 1) return null;

  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide justify-center">
      {slides.map((slide, index) => (
        <button
          key={slide.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(index)}
          className={`shrink-0 w-12 h-[4.25rem] rounded-lg overflow-hidden ring-2 transition-all ${
            index === activeIndex ? 'ring-white scale-105' : 'ring-white/25 opacity-70'
          }`}
        >
          {slide.media.type === 'VIDEO' ? (
            <video src={slide.media.previewUrl} className="w-full h-full object-cover" muted playsInline />
          ) : (
            <img src={slide.media.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          )}
        </button>
      ))}
    </div>
  );
}
