export type ResultsArtifactLogFields = {
  gameId: string;
  generationVersion?: number;
  step: string;
  durationMs?: number;
  provider?: string;
  status?: string;
  error?: string;
  replicatePredictionId?: string;
  replicateModel?: string;
  styleId?: string;
  family?: string;
};

export function logResultsArtifact(fields: ResultsArtifactLogFields): void {
  console.log(
    JSON.stringify({
      scope: 'results-artifacts',
      at: new Date().toISOString(),
      ...fields,
    })
  );
}
