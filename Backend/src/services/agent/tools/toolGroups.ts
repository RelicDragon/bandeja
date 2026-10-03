/**
 * Tool groups (docs/domains/agent.md "Tool groups"). Sending the whole catalogue (~60 tools,
 * ~14k tokens of schemas) on every step dominated the prompt, so with
 * `AGENT_TOOL_GROUPS_ENABLED` (default on) a step only carries:
 *
 *   core tools → `load_tools` → each loaded group, in the order it was loaded.
 *
 * A group is loaded by (1) a tool call of that group earlier in the chat's recent history
 * (so the next turns keep it; no schema change), (2) a conservative keyword match on the
 * latest user message, (3) the model calling `load_tools`, or (4) the model calling a tool of
 * an unloaded group directly (it is executed and its group loaded). Loaded groups are only
 * appended, so the tool list prefix stays byte-stable for the provider's prompt cache.
 *
 * Groups never widen access: every listing and call still goes through
 * `registry.toolsForPrincipal` (`visibleTo`); `load_tools` for a group the principal has no
 * visible tool in (e.g. `admin` for a non-admin) loads nothing.
 */
import type { AgentLlmMessage } from '../llm/deepseekStream';

/** Order = listing order of the group descriptions; `core` is always sent. */
export const AGENT_TOOL_GROUPS = [
  'core',
  'games',
  'roster',
  'booking',
  'money',
  'league',
  'results',
  'play_intent',
  'chat',
  'weather',
  'web',
  'admin',
] as const;

export type AgentToolGroup = (typeof AGENT_TOOL_GROUPS)[number];
export type AgentLoadableToolGroup = Exclude<AgentToolGroup, 'core'>;

export const LOAD_TOOLS_NAME = 'load_tools';

/** One line per group: the `load_tools` description and the rule-6 group headers. */
export const AGENT_TOOL_GROUP_DESCRIPTIONS: Record<AgentLoadableToolGroup, string> = {
  games: 'create, change, join, leave or cancel a game; invite players',
  roster: "a game's participants: remove a player, make a game admin, accept or decline from the queue, set the trainer",
  booking: 'court bookings: free slots, book a court (with or without a new game), my bookings, link / unlink / cancel a booking',
  money: 'game cost split: balances, wallet, who paid, mark a share paid, pay with coins, set a game price, remind unpaid players',
  league: 'leagues: season, standings, schedule, reschedule a fixture, round start message',
  results: 'match results: read results, enter a score, finish results',
  play_intent: '"want to play" status: read, set or cancel it, and see matching players',
  chat: "a game's chat: summarize it or post a message",
  weather: 'weather forecast for a game, club or city',
  web: 'web search, page fetch and pictures, for facts outside the app',
  admin: 'platform admin: find users, change user flags, edit any game, approve or decline events',
};

export function isAgentToolGroup(value: unknown): value is AgentToolGroup {
  return typeof value === 'string' && (AGENT_TOOL_GROUPS as readonly string[]).includes(value);
}

/**
 * Conservative per-group keywords over the 11 app languages (en ru sr es cs ar zh id hi th ja).
 * Stems, not full words: a miss only costs one `load_tools` step, a false hit costs tokens.
 * Latin and Cyrillic stems are anchored at a word start (`(?<!\p{L})`); Arabic, Devanagari
 * and scripts without spaces match as substrings.
 */
const KEYWORDS: Partial<Record<AgentLoadableToolGroup, RegExp>> = {
  booking: new RegExp(
    [
      String.raw`(?<!\p{L})(book|booking|reserv|slot|free court)`,
      String.raw`(?<!\p{L})(брон|забронир|слот)`,
      String.raw`(?<!\p{L})(rezerv|termin)`,
      'حجز|احجز',
      '预订|预约|订场',
      String.raw`(?<!\p{L})(sewa)`,
      'बुक|बुकिंग',
      'จอง',
      '予約',
    ].join('|'),
    'iu',
  ),
  money: new RegExp(
    [
      String.raw`(?<!\p{L})(pay|paid|price|cost|owe|money|wallet|coin|split the)`,
      String.raw`(?<!\p{L})(оплат|заплат|плат[иеё]|цен[аыу]|стоимост|долг|деньг|кошел|монет)`,
      String.raw`(?<!\p{L})(plat|plać|cen[aue]|dug|novac|novč|novčan)`,
      String.raw`(?<!\p{L})(pag[oaué]|precio|coste|costo|dinero|deuda|monedero)`,
      String.raw`(?<!\p{L})(zaplat|cena|peníz|dluh|peněžen)`,
      'دفع|ادفع|سعر|تكلفة|محفظة|فلوس',
      '付款|支付|价格|费用|钱包|欠',
      String.raw`(?<!\p{L})(bayar|harga|biaya|uang|dompet)`,
      'भुगतान|कीमत|पैसे|वॉलेट',
      'จ่าย|ราคา|ค่าใช้จ่าย|กระเป๋าเงิน',
      '支払|料金|値段|お金|ウォレット|割り勘',
    ].join('|'),
    'iu',
  ),
  league: new RegExp(
    [
      String.raw`(?<!\p{L})(league|season|standings|fixture)`,
      String.raw`(?<!\p{L})(лиг[аиуе]|сезон|турнирн)`,
      String.raw`(?<!\p{L})(lig[aieu]|sezon|tabel)`,
      String.raw`(?<!\p{L})(liga|temporada|clasificaci)`,
      String.raw`(?<!\p{L})(sezón|tabulk)`,
      'دوري|موسم',
      '联赛|赛季|积分榜',
      String.raw`(?<!\p{L})(musim|klasemen)`,
      'लीग|सीज़न',
      'ลีก|ฤดูกาล',
      'リーグ|シーズン|順位',
    ].join('|'),
    'iu',
  ),
  results: new RegExp(
    [
      String.raw`(?<!\p{L})(score|result)`,
      String.raw`(?<!\p{L})(счёт|счет[аеу ]|результат)`,
      String.raw`(?<!\p{L})(rezultat)`,
      String.raw`(?<!\p{L})(resultado|marcador)`,
      String.raw`(?<!\p{L})(výsled|skóre)`,
      'نتيجة|النتائج',
      '比分|结果',
      String.raw`(?<!\p{L})(skor|hasil)`,
      'स्कोर|परिणाम|नतीजे',
      'คะแนน|ผลการแข่ง',
      'スコア|結果',
    ].join('|'),
    'iu',
  ),
  weather: new RegExp(
    [
      String.raw`(?<!\p{L})(weather|rain|forecast|wind)`,
      String.raw`(?<!\p{L})(погод|дожд|прогноз|ветер|ветр)`,
      String.raw`(?<!\p{L})(vreme|kiš|prognoz)`,
      String.raw`(?<!\p{L})(clima|lluvia|llover|pronóstico)`,
      String.raw`(?<!\p{L})(počasí|déšť|prš)`,
      'طقس|مطر',
      '天气|下雨|预报',
      String.raw`(?<!\p{L})(cuaca|hujan)`,
      'मौसम|बारिश',
      'อากาศ|ฝน',
      '天気|雨|予報',
    ].join('|'),
    'iu',
  ),
  chat: new RegExp(
    [
      String.raw`(?<!\p{L})(chat|post a message|write to the)`,
      String.raw`(?<!\p{L})(чат)`,
      String.raw`(?<!\p{L})(čet|poruk)`,
      String.raw`(?<!\p{L})(mensaje)`,
      String.raw`(?<!\p{L})(zpráv)`,
      'دردشة|محادثة',
      '聊天|群里',
      String.raw`(?<!\p{L})(obrolan)`,
      'चैट',
      'แชท',
      'チャット',
    ].join('|'),
    'iu',
  ),
  play_intent: new RegExp(
    [
      String.raw`(?<!\p{L})(want to play|looking for a (game|partner)|play intent)`,
      String.raw`(?<!\p{L})(хочу (по)?играть|ищу (игру|партн))`,
      String.raw`(?<!\p{L})(želim da igram|tražim (igru|partner))`,
      String.raw`(?<!\p{L})(quiero jugar|busco (partido|pareja|compañero))`,
      String.raw`(?<!\p{L})(chci hrát|hledám (hru|spoluhráč))`,
      'أريد أن ألعب|أبحث عن (مباراة|شريك)',
      '想打球|找球友|想玩',
      String.raw`(?<!\p{L})(ingin main|mau main|cari (lawan|partner))`,
      'खेलना चाहता|खेलना चाहती',
      'อยากเล่น|หาคนเล่น',
      'プレーしたい|相手を探',
    ].join('|'),
    'iu',
  ),
  web: new RegExp(
    [
      String.raw`(?<!\p{L})(internet|online|google|news|picture|photo|image|what does .* look like)`,
      String.raw`(?<!\p{L})(интернет|новост|картинк|фото|как выгляд)`,
      String.raw`(?<!\p{L})(internet|vesti|vijest|slik)`,
      String.raw`(?<!\p{L})(noticia|imagen|foto)`,
      String.raw`(?<!\p{L})(zpráv[ay] z|obrázek|fotk)`,
      'إنترنت|أخبار|صورة',
      '网上|新闻|图片|照片',
      String.raw`(?<!\p{L})(berita|gambar)`,
      'इंटरनेट|समाचार|तस्वीर',
      'อินเทอร์เน็ต|ข่าว|รูปภาพ',
      'ネット|ニュース|画像|写真',
    ].join('|'),
    'iu',
  ),
  roster: new RegExp(
    [
      String.raw`(?<!\p{L})(kick|remove (him|her|them|a player)|waiting list|queue|trainer|coach|make .* admin)`,
      String.raw`(?<!\p{L})(очеред|тренер|удали(те)? (игрок|его|её)|исключ)`,
      String.raw`(?<!\p{L})(trener|red čekanja|izbaci)`,
      String.raw`(?<!\p{L})(entrenador|lista de espera|cola)`,
      String.raw`(?<!\p{L})(trenér|fronta|vyhoď)`,
      'مدرب|قائمة الانتظار',
      '教练|候补|排队',
      String.raw`(?<!\p{L})(pelatih|antrean)`,
      'कोच|प्रतीक्षा सूची',
      'โค้ช|คิว',
      'コーチ|キャンセル待ち',
    ].join('|'),
    'iu',
  ),
  games: new RegExp(
    [
      String.raw`(?<!\p{L})(create|new game|organi[sz]e|join|sign me up|leave|cancel|reschedule|move (the|my) game|invite|rename|change the (time|club|name))`,
      String.raw`(?<!\p{L})(созда|организ|запиш|присоедин|выйти из|отмен|перенес|пригла|переимен)`,
      String.raw`(?<!\p{L})(napravi|kreiraj|organizuj|prijavi|pridruž|napusti|otkaž|pomeri|pozovi)`,
      String.raw`(?<!\p{L})(crea|organiza|apúntame|unirme|salir del|cancela|mueve|invita)`,
      String.raw`(?<!\p{L})(vytvoř|založ|přihlas|připoj|odhlas|zruš|přesuň|pozvi)`,
      'أنشئ|انضم|ألغ|غادر|ادع',
      '创建|新建|加入|退出|取消|改期|邀请',
      String.raw`(?<!\p{L})(buat|gabung|keluar dari|batalkan|undang|pindahkan)`,
      'बनाओ|बनाएं|जुड़|छोड़|रद्द|आमंत्रित',
      'สร้าง|เข้าร่วม|ออกจาก|ยกเลิก|เชิญ|เลื่อน',
      '作成|参加|抜け|キャンセル|招待|変更',
    ].join('|'),
    'iu',
  ),
};

/** Groups the latest user message hints at (keyword heuristics, `AGENT_TOOL_GROUPS` order). */
export function agentToolGroupsForText(text: string | null | undefined): AgentLoadableToolGroup[] {
  const value = (text ?? '').slice(0, 4000);
  if (!value.trim()) return [];
  return (AGENT_TOOL_GROUPS.filter((group) => group !== 'core') as AgentLoadableToolGroup[]).filter(
    (group) => KEYWORDS[group]?.test(value) === true,
  );
}

/** Groups named in a `load_tools` call's raw JSON arguments (unknown names dropped). */
export function loadToolsGroupsFromArguments(raw: string | unknown): AgentToolGroup[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return [];
    }
  }
  const groups = (value as { groups?: unknown } | null)?.groups;
  return Array.isArray(groups) ? groups.filter(isAgentToolGroup) : [];
}

/** How many of the latest user turns keep a group loaded. */
export const AGENT_TOOL_GROUP_HISTORY_TURNS = 8;

/**
 * Groups used in the recent replayed history, in order of first use: the group of every tool
 * call plus the groups of every `load_tools` call, within the last
 * `AGENT_TOOL_GROUP_HISTORY_TURNS` user turns. Deterministic, so a turn re-derives the same
 * order the previous turn ended with (prefix-cache friendly).
 */
export function agentToolGroupsFromHistory(
  messages: readonly AgentLlmMessage[],
  groupOf: (toolName: string) => AgentToolGroup | undefined,
  maxUserTurns = AGENT_TOOL_GROUP_HISTORY_TURNS,
): AgentToolGroup[] {
  let start = 0;
  let seen = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== 'user') continue;
    seen += 1;
    start = index;
    if (seen >= maxUserTurns) break;
  }
  const out: AgentToolGroup[] = [];
  const add = (group: AgentToolGroup | undefined) => {
    if (group && group !== 'core' && !out.includes(group)) out.push(group);
  };
  for (const message of messages.slice(start)) {
    if (message.role !== 'assistant') continue;
    for (const call of message.tool_calls ?? []) {
      if (call.function.name === LOAD_TOOLS_NAME) {
        for (const group of loadToolsGroupsFromArguments(call.function.arguments)) add(group);
      } else {
        add(groupOf(call.function.name));
      }
    }
  }
  return out;
}
