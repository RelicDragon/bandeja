/** Each change-ends rail (`w-[1.35rem]`) + `gap-1` between rail and court. */
export const SCHEMATIC_SIDE_RAIL_PX = 22;
export const SCHEMATIC_SIDE_GAP_PX = 4;

export type LiveSchematicSize = {
  totalW: number;
  totalH: number;
  courtW: number;
  courtH: number;
};

/** Largest court rect that fits inside the container (preserves aspect, touches one axis). */
export function fitLiveSchematicSize(
  containerW: number,
  containerH: number,
  courtAspectW: number,
  courtAspectH: number,
  withSideRails: boolean,
): LiveSchematicSize | null {
  if (containerW <= 0) return null;

  const courtRatio = courtAspectW / courtAspectH;
  // Flex layouts often report height 0 before/without a bounded block axis; size from width.
  const effectiveH = containerH > 0 ? containerH : containerW / courtRatio;
  const extraW = withSideRails ? SCHEMATIC_SIDE_RAIL_PX * 2 + SCHEMATIC_SIDE_GAP_PX * 2 : 0;

  let courtW = Math.max(0, containerW - extraW);
  let courtH = courtW / courtRatio;

  if (courtH > effectiveH) {
    courtH = effectiveH;
    courtW = courtH * courtRatio;
  }

  const totalW = courtW + extraW;

  return {
    totalW: Math.floor(totalW),
    totalH: Math.floor(courtH),
    courtW: Math.floor(courtW),
    courtH: Math.floor(courtH),
  };
}
