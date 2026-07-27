import { Trophy, Medal } from 'lucide-react';
import { useStandingsAwardFlip } from './useStandingsAwardFlip';

function placeIcon(index: number) {
  if (index === 0) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
  if (index === 2) return <Medal className="h-5 w-5 text-amber-600" />;
  return null;
}

/** Isolated so the award flip does not re-render the standings table body. */
export function LeagueStandingsPlaceCell({ index }: { index: number }) {
  const icon = placeIcon(index);
  const showAward = useStandingsAwardFlip(icon != null);
  const placeNumber = index + 1;

  if (!icon) {
    return (
      <span className="text-sm font-medium text-gray-900 dark:text-white">{placeNumber}</span>
    );
  }

  return (
    <div className="relative flex items-center justify-center w-12 h-6 overflow-hidden">
      <span
        className={`text-sm font-semibold text-gray-900 dark:text-white transition-all duration-500 transform ${
          showAward ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        {placeNumber}
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 transform ${
          showAward ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        {icon}
      </span>
    </div>
  );
}
