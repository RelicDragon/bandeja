import { GameDetailsShell, type GameDetailsShellProps } from './GameDetailsShell';

export type LeagueDetailsContentProps = Omit<GameDetailsShellProps, 'variant'>;

export const LeagueDetailsContent = ({ initialGame = null, ...rest }: LeagueDetailsContentProps) => (
  <GameDetailsShell variant="league" initialGame={initialGame} {...rest} />
);
