import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChangeEndsSideTag } from './ChangeEndsSideMarkers';
import {
  fitLiveSchematicSize,
  SCHEMATIC_SIDE_GAP_PX,
  SCHEMATIC_SIDE_RAIL_PX,
  type LiveSchematicSize,
} from './liveSchematicFit';

/** Court fills the court slot inside {@link LiveCourtViewport}. */
export const LIVE_COURT_FIT_CLASS = 'size-full min-h-0 min-w-0';

type LiveCourtViewportProps = {
  children: ReactNode;
  aspect: readonly [number, number];
  changeEndsBeforeNextPoint?: boolean;
  changeEndsLabel?: string;
  className?: string;
};

export function LiveCourtViewport({
  children,
  aspect,
  changeEndsBeforeNextPoint = false,
  changeEndsLabel = '',
  className,
}: LiveCourtViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<LiveSchematicSize | null>(null);
  const [aw, ah] = aspect;
  const withSideRails = changeEndsBeforeNextPoint && changeEndsLabel.length > 0;

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = fitLiveSchematicSize(rect.width, rect.height, aw, ah, withSideRails);
      setSize((prev) =>
        prev &&
        next &&
        prev.totalW === next.totalW &&
        prev.totalH === next.totalH &&
        prev.courtW === next.courtW &&
        prev.courtH === next.courtH
          ? prev
          : next,
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aw, ah, withSideRails]);

  return (
    <div
      ref={hostRef}
      className={`min-h-0 w-full flex-1 overflow-hidden ${className ?? ''}`}
    >
      <div className="flex size-full items-center justify-center overflow-hidden">
        {size && size.totalW > 0 && size.totalH > 0 ? (
          <div
            className="relative shrink-0"
            style={{ width: size.totalW, height: size.totalH }}
          >
            <div
              className="absolute top-0 overflow-visible"
              style={{
                left: withSideRails ? SCHEMATIC_SIDE_RAIL_PX + SCHEMATIC_SIDE_GAP_PX : 0,
                width: size.courtW,
                height: size.courtH,
              }}
            >
              {children}
            </div>
            {withSideRails ? (
              <ChangeEndsSideTag
                side="left"
                label={changeEndsLabel}
                className="absolute left-0 top-1/2 -translate-y-1/2"
              />
            ) : null}
            {withSideRails ? (
              <ChangeEndsSideTag
                side="right"
                label={changeEndsLabel}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: size.courtW + SCHEMATIC_SIDE_GAP_PX }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
