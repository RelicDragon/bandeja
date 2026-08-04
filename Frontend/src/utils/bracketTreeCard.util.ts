/**
 * Bracket tree card/column sizing.
 * Cards grow with content (player names); each column matches its widest card.
 * Horizontal scroll absorbs wider columns — never clip names to a fixed rem.
 */
export const BRACKET_TREE_CARD_CLASS = 'w-full min-w-max';

/** Column width follows the widest card in that round. */
export const BRACKET_TREE_COLUMN_CLASS = 'w-max min-w-[min(92vw,16rem)]';
