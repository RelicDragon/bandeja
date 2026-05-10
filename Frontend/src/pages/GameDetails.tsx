import { GameDetailsShell, type GameDetailsShellProps } from './GameDetailsShell';

export type GameDetailsContentProps = Omit<GameDetailsShellProps, 'variant'>;

export const GameDetailsContent = ({ initialGame = null, ...rest }: GameDetailsContentProps) => (
  <GameDetailsShell variant="game" initialGame={initialGame} {...rest} />
);
