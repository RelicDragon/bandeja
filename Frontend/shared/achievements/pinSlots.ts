import { SHOWCASE_SLOT_COUNT } from './showcaseResolver';
import type { AchievementPinInput } from './types';

export type PinSlotDecision =
  | { type: 'already'; slot: number }
  | { type: 'insert'; slot: number }
  | { type: 'full' };

/**
 * Decide where to place a new pin. Max SHOWCASE_SLOT_COUNT pins.
 * When full, caller must unpin first (no silent replace).
 */
export function decidePinSlot(input: {
  existingPins: AchievementPinInput[];
  achievementId: string;
  slotCount?: number;
}): PinSlotDecision {
  const slotCount = input.slotCount ?? SHOWCASE_SLOT_COUNT;
  const pins = input.existingPins.filter((p) => p.slot >= 0 && p.slot < slotCount);

  const already = pins.find((p) => p.achievementId === input.achievementId);
  if (already) {
    return { type: 'already', slot: already.slot };
  }

  const used = new Set(pins.map((p) => p.slot));
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (!used.has(slot)) {
      return { type: 'insert', slot };
    }
  }

  return { type: 'full' };
}

export function isValidShowcaseSlot(slot: number, slotCount = SHOWCASE_SLOT_COUNT): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < slotCount;
}
