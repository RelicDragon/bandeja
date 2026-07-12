export type SetScoreTileState = 'win' | 'loss' | 'tie' | 'neutral';

export function getSetScoreTileState(own: number, other: number): SetScoreTileState {
  if (own === 0 && other === 0) return 'neutral';
  if (own > other) return 'win';
  if (own < other) return 'loss';
  return 'tie';
}
