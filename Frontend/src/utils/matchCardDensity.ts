export type MatchCardDensity = 'comfortable' | 'compact' | 'dense';

export type MatchCardDensityLayout = {
  density: MatchCardDensity;
  playersCol: string;
  setCol: string;
  tileSize: 'md' | 'sm' | 'xs';
  faceSize: 'sm' | 'md';
  playerRowClass: string;
  playerNameClass: string;
  placeholderGapClass: string;
  placeholderTextClass: string;
  scoreCellClass: string;
  teamMinHeightClass: string;
};

const LAYOUTS: Record<MatchCardDensity, Omit<MatchCardDensityLayout, 'density'>> = {
  comfortable: {
    playersCol: 'minmax(9rem, 1fr)',
    setCol: '2.75rem',
    tileSize: 'md',
    faceSize: 'md',
    playerRowClass:
      'relative flex min-h-[40px] w-full min-w-0 flex-row items-center gap-2 px-2 py-0.5',
    playerNameClass:
      'min-w-0 flex-1 truncate text-left text-xs font-medium text-gray-800 dark:text-gray-200',
    placeholderGapClass: 'gap-2',
    placeholderTextClass: 'text-xs text-gray-400 dark:text-gray-500',
    scoreCellClass: 'flex h-full min-h-[40px] items-center justify-center p-0.5',
    teamMinHeightClass: 'min-h-[36px]',
  },
  compact: {
    playersCol: 'minmax(6.25rem, 1fr)',
    setCol: '2.25rem',
    tileSize: 'sm',
    faceSize: 'sm',
    playerRowClass:
      'relative flex min-h-[30px] w-full min-w-0 flex-row items-center gap-1 px-1 py-0',
    playerNameClass:
      'min-w-0 flex-1 truncate text-left text-[10px] font-medium leading-tight text-gray-800 dark:text-gray-200',
    placeholderGapClass: 'gap-1',
    placeholderTextClass: 'text-[10px] text-gray-400 dark:text-gray-500',
    scoreCellClass: 'flex h-full min-h-[32px] items-center justify-center p-px',
    teamMinHeightClass: 'min-h-[28px]',
  },
  dense: {
    playersCol: 'minmax(4.75rem, 1fr)',
    setCol: '1.875rem',
    tileSize: 'xs',
    faceSize: 'sm',
    playerRowClass:
      'relative flex min-h-[26px] w-full min-w-0 flex-row items-center gap-0.5 px-0.5 py-0',
    playerNameClass:
      'min-w-0 flex-1 truncate text-left text-[9px] font-medium leading-tight text-gray-800 dark:text-gray-200',
    placeholderGapClass: 'gap-0.5',
    placeholderTextClass: 'text-[9px] text-gray-400 dark:text-gray-500',
    scoreCellClass: 'flex h-full min-h-[28px] items-center justify-center p-0',
    teamMinHeightClass: 'min-h-[24px]',
  },
};

/** Rough CSS-px budget so set tiles stay on-screen without horizontal crop. */
export function resolveMatchCardDensity(
  widthPx: number,
  setCount: number,
  hasActionsColumn: boolean,
): MatchCardDensity {
  if (widthPx <= 0) return 'compact';
  const actions = hasActionsColumn ? 48 : 0;
  const fits = (playersMin: number, setW: number) =>
    playersMin + Math.max(0, setCount) * setW + actions <= widthPx;

  if (fits(144, 44)) return 'comfortable';
  if (fits(100, 36)) return 'compact';
  return 'dense';
}

export function matchCardDensityLayout(
  density: MatchCardDensity,
  opts?: { preferSmallFaces?: boolean },
): MatchCardDensityLayout {
  const base = LAYOUTS[density];
  const faceSize = opts?.preferSmallFaces ? 'sm' : base.faceSize;
  return { density, ...base, faceSize };
}
