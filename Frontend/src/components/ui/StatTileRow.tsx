import { Children, type ReactNode } from 'react';

export interface StatTileRowProps {
  /** 2–4 `StatTile`s. */
  children: ReactNode;
  className?: string;
}

const DIVIDER = 'border-gray-200/60 dark:border-gray-600/50';

/** Column class per tile count; four tiles wrap to a 2×2 grid below `sm`. */
const COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

/**
 * Hairline divider widths per cell, per tile count. Logical (`border-s`), so the
 * band mirrors correctly in RTL. The four-tile row is the only wrapping case, so
 * cells 3 and 4 swap a row divider for a column divider at `sm`.
 */
const CELL_BORDERS: Record<number, readonly string[]> = {
  1: [''],
  2: ['', 'border-s'],
  3: ['', 'border-s', 'border-s'],
  4: ['', 'border-s', 'border-t sm:border-t-0 sm:border-s', 'border-t border-s sm:border-t-0'],
};

/**
 * The house stat band: 2–4 `StatTile`s inside one rounded surface separated by
 * hairline dividers (`LevelHistoryProfileStatsSection` is the visual reference).
 */
export const StatTileRow = ({ children, className = '' }: StatTileRowProps) => {
  const tiles = Children.toArray(children).slice(0, 4);
  if (tiles.length === 0) return null;

  const borders = CELL_BORDERS[tiles.length];

  return (
    <div
      className={`grid ${COLUMNS[tiles.length]} overflow-hidden rounded-xl border bg-gray-100 dark:bg-gray-700/50 ${DIVIDER} ${className}`.trim()}
    >
      {tiles.map((tile, index) => (
        <div key={index} className={`min-w-0 ${DIVIDER} ${borders[index]}`.trim()}>
          {tile}
        </div>
      ))}
    </div>
  );
};
