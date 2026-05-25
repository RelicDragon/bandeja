import type { OverlayStyleV2 } from '@/components/stories/create/types/storyEditor.types';
import { StoryCompositionFrame } from '@/components/stories/StoryCompositionFrame';
import { StoryCompositionCanvasOverlays } from '@/components/stories/StoryCompositionCanvasOverlays';

type MediaStoryOverlayV2Props = {
  overlayStyle: OverlayStyleV2;
};

/** Live v2 overlay layers aligned to the same 9:16 frame as composition media. */
export function MediaStoryOverlayV2({ overlayStyle }: MediaStoryOverlayV2Props) {
  const layers = overlayStyle.layers ?? [];
  if (layers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <StoryCompositionFrame>
        {({ frameScale }) => (
          <div className="absolute inset-0">
            <StoryCompositionCanvasOverlays overlayStyle={overlayStyle} frameScale={frameScale} />
          </div>
        )}
      </StoryCompositionFrame>
    </div>
  );
}
