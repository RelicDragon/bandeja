import { GameChat } from './GameChat';

/** Standalone game chat (e.g. deep links). Chats tab uses MainPage + embedded GameChat.
 *  Mobile/full-page: unmount on route leave runs socket leave + initial-load abort (I1.5). */
export const GameChatRoute = () => <GameChat />;
