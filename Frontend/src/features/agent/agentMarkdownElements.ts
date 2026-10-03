/** Pure helpers behind `AgentMarkdown`'s code blocks, tables and in-app link chips. */

/** Minimal hast shape (react-markdown hands components the `node` it rendered from). */
export interface AgentHastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: AgentHastNode[];
}

/** Concatenated text of a hast subtree (code block source, table cell text). */
export function agentHastText(node: AgentHastNode | undefined | null): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(agentHastText).join('');
}

/** `language-ts` on the fenced block's `<code>` → `ts`; null for an unlabelled fence. */
export function agentCodeLanguage(pre: AgentHastNode | undefined | null): string | null {
  const code = pre?.children?.find((c) => c.type === 'element' && c.tagName === 'code');
  const raw = code?.properties?.className;
  const classes = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/\s+/) : [];
  const lang = classes.find((c) => c.startsWith('language-'))?.slice('language-'.length);
  return lang ? lang : null;
}

/** Source of a fenced block without the trailing newline the parser keeps. */
export function agentCodeText(pre: AgentHastNode | undefined | null): string {
  return agentHastText(pre).replace(/\n$/, '');
}

/** Scores, prices, percentages, times: `12`, `-3.5`, `€40`, `6-4`, `18:30`, `75 %`. */
const NUMERIC_CELL_RE = /^[+\-−]?[$€£₽¥]?\s?\d[\d\s.,:/–-]*\s?[%°€$£₽¥]?$/;

export function isAgentNumericCell(text: string): boolean {
  const value = text.trim();
  return value.length > 0 && value.length <= 24 && NUMERIC_CELL_RE.test(value);
}

export type AgentLinkEntityKind = 'game' | 'club' | 'player' | 'chat' | 'other';

/** What an in-app path opens, for the link chip's icon. */
export function agentLinkEntityKind(path: string): AgentLinkEntityKind {
  const pathname = path.split(/[?#]/)[0];
  if (/^\/games\/[^/]+/.test(pathname)) return 'game';
  if (/^\/clubs\/[^/]+/.test(pathname)) return 'club';
  if (/^\/user-profile\/[^/]+/.test(pathname)) return 'player';
  if (/^\/(chats|user-chat|group-chat|channel-chat)(\/|$)/.test(pathname)) return 'chat';
  return 'other';
}
