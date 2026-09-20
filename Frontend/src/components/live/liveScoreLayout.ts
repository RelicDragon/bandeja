/**
 * PRD 349 — the shared-element id linking a rail score block to the broadcast
 * header. Kept out of the component file so importing the id never pulls in the card.
 */

export function liveScoreLayoutId(gameId: string): string {
  return `live-score-${gameId}`;
}
