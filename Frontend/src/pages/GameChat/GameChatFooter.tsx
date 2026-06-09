export type GameChatFooterVariant =
  | { type: 'blocked' }
  | { type: 'request' }
  | { type: 'input' }
  | { type: 'join' };

export interface GameChatFooterProps {
  visible: boolean;
  variant: GameChatFooterVariant | null;
}

export { ComposerShell as GameChatFooter } from './ComposerShell';
