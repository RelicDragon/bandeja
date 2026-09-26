/** Scroll helpers for the results board; rounds and matches carry `data-results-*-id`. */

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function scrollToResultsRound(roundId: string): void {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(`[data-results-round-id="${roundId}"]`)
      ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
}

/** Waits for a round to finish expanding, then centers the match and pulses its outline. */
export function scrollToResultsMatch(matchId: string, delayMs = 320): void {
  window.setTimeout(() => {
    const card = document.querySelector<HTMLElement>(`[data-results-match-id="${matchId}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    if (reducedMotion() || typeof card.animate !== 'function') return;
    card.animate(
      [
        { boxShadow: '0 0 0 0 rgba(59, 130, 246, 0)' },
        { boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.55)' },
        { boxShadow: '0 0 0 0 rgba(59, 130, 246, 0)' },
      ],
      { duration: 1400, easing: 'ease-out' },
    );
  }, delayMs);
}
