/** GAME_RESULT story segments require finalized results and completed artifact pipeline. */
export function isGameResultStoryEligible(game: {
  resultsStatus: string;
  resultsArtifactsReadyAt: Date | null;
}): boolean {
  return (
    game.resultsStatus === 'FINAL' && game.resultsArtifactsReadyAt != null
  );
}
