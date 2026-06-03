import { PickleballBallIcon } from '@/components/icons/PickleballBallIcon';
import { ShuttlecockIcon } from '@/components/icons/ShuttlecockIcon';
import { SquashBallIcon } from '@/components/icons/SquashBallIcon';
import { TableTennisBallIcon } from '@/components/icons/TableTennisBallIcon';
import { PadelBallIcon } from '@/components/icons/PadelBallIcon';
import { TennisBallIcon } from '@/components/icons/TennisBallIcon';
import type { Sport } from '@/types';

type LiveServeBallIndicatorProps = {
  /** Sits in normal flow after a name (e.g. TV roster), not on the avatar corner */
  inline?: boolean;
  sport?: Sport | string | null;
};

function isBadmintonSport(sport: Sport | string | null | undefined): boolean {
  return typeof sport === 'string' && sport.toUpperCase() === 'BADMINTON';
}

function isSquashSport(sport: Sport | string | null | undefined): boolean {
  return typeof sport === 'string' && sport.toUpperCase() === 'SQUASH';
}

function isPickleballSport(sport: Sport | string | null | undefined): boolean {
  return typeof sport === 'string' && sport.toUpperCase() === 'PICKLEBALL';
}

function isTableTennisSport(sport: Sport | string | null | undefined): boolean {
  return typeof sport === 'string' && sport.toUpperCase() === 'TABLE_TENNIS';
}

function isTennisSport(sport: Sport | string | null | undefined): boolean {
  return typeof sport === 'string' && sport.toUpperCase() === 'TENNIS';
}

export function LiveServeBallIndicator({ inline, sport }: LiveServeBallIndicatorProps) {
  if (isBadmintonSport(sport)) {
    const iconSize = inline ? 13 : 10;
    const wrapClass = inline
      ? 'inline-flex size-5 items-center justify-center'
      : 'absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center';
    return (
      <span
        role="img"
        aria-label="Serving"
        className={`pointer-events-none shrink-0 rounded-full border border-amber-800/30 bg-gradient-to-br from-amber-500 to-amber-700 shadow-[0_1px_2px_rgba(0,0,0,0.22)] ${wrapClass}`}
      >
        <ShuttlecockIcon
          size={iconSize}
          className="text-amber-50 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
        />
      </span>
    );
  }

  if (isSquashSport(sport)) {
    const size = inline ? 15 : 12;
    return (
      <SquashBallIcon
        size={size}
        role="img"
        aria-label="Serving"
        className="pointer-events-none shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      />
    );
  }

  if (isPickleballSport(sport)) {
    const size = inline ? 15 : 12;
    return (
      <PickleballBallIcon
        size={size}
        role="img"
        aria-label="Serving"
        className="pointer-events-none shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      />
    );
  }

  if (isTableTennisSport(sport)) {
    const size = inline ? 15 : 12;
    return (
      <TableTennisBallIcon
        size={size}
        role="img"
        aria-label="Serving"
        className="pointer-events-none shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      />
    );
  }

  if (isTennisSport(sport)) {
    const size = inline ? 15 : 12;
    return (
      <TennisBallIcon
        size={size}
        role="img"
        aria-label="Serving"
        className="pointer-events-none shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      />
    );
  }

  const size = inline ? 15 : 12;
  const posClass = inline ? 'inline-flex shrink-0' : 'absolute -bottom-0.5 -right-0.5';
  return (
    <PadelBallIcon
      size={size}
      role="img"
      aria-label="Serving"
      className={`pointer-events-none ${posClass} drop-shadow-[0_1px_2px_rgba(0,0,0,0.35),0_0_10px_rgba(220,252,80,0.5)]`}
    />
  );
}
