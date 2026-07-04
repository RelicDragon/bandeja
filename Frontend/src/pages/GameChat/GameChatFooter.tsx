export type GameChatFooterVariant =
  | { type: 'blocked' }
  | { type: 'request' }
  | { type: 'input' }
  | { type: 'join' }
  | { type: 'archived' };

export interface GameChatFooterProps {
  visible: boolean;
  variant: GameChatFooterVariant | null;
}

export { ComposerShell as GameChatFooter } from './ComposerShell';
