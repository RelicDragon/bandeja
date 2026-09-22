/**
 * PRD 364 — scroll an existing game-details section into view.
 *
 * The block never re-implements a workflow: each action lands on the section
 * that already owns it. Anchors are plain DOM ids / data attributes on those
 * sections, listed here so the block and the sections cannot drift apart.
 */
export const ORGANIZER_SECTION_SELECTORS = {
  /** The join-queue list inside `GameParticipants`. */
  queue: '#game-join-queue',
  /** `GameLinkedBookingsSection`. */
  bookings: '#game-linked-bookings',
  /** `GameCostCard` (PRD 348 already tags its root). */
  cost: '[data-cost-card]',
} as const;

export type OrganizerSectionKey = keyof typeof ORGANIZER_SECTION_SELECTORS;

/** `true` when the section exists and was scrolled to; `false` when it is not on the page. */
export function scrollToSection(
  section: OrganizerSectionKey,
  reduceMotion: boolean,
  root: ParentNode | null = typeof document === 'undefined' ? null : document,
): boolean {
  if (!root) return false;
  const element = root.querySelector<HTMLElement>(ORGANIZER_SECTION_SELECTORS[section]);
  if (!element) return false;
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  return true;
}
