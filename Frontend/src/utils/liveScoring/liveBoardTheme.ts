export type LiveBoardTheme = 'dark' | 'light';

export function parseLiveBoardTheme(raw: string | null | undefined): LiveBoardTheme {
  if (raw === 'light') return 'light';
  return 'dark';
}

export function liveBoardThemeSearchParam(theme: LiveBoardTheme): string {
  return theme === 'light' ? 'light' : 'dark';
}
