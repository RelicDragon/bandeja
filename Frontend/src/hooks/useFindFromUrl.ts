import { useSearchParams } from 'react-router-dom';

export function useFindFromUrl() {
  const [searchParams] = useSearchParams();
  const view = (searchParams.get('view') || 'calendar') as 'calendar' | 'list';
  const date = searchParams.get('date') || undefined;
  const week = searchParams.get('week') || undefined;
  const game = searchParams.get('game') === '1';
  const training = searchParams.get('training') === '1';
  const tournament = searchParams.get('tournament') === '1';
  const leagues = searchParams.get('leagues') === '1';

  return { view, date, week, game, training, tournament, leagues };
}
