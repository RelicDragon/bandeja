/**
 * User-facing agent strings: tool chip labels and summaries, confirmation-card previews
 * and action results, in the 11 app languages (en ru sr es cs ar zh id hi th ja).
 * English is the fallback for a missing language or key.
 *
 * These go to the UI only. What the model sees (tool JSON, outcome notes) stays English.
 * Entity type / game type / sport names reuse the backend notification dictionary
 * (`utils/translations.ts` `t()`), so they match push notifications.
 */
import { t as notificationT } from '../../../utils/translations';
import { resolveIntlLocale } from '../../../utils/intlLocale';
import { AGENT_I18N_TRANSLATIONS } from './agentI18nTranslations';

export const AGENT_LOCALES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'] as const;

export const AGENT_I18N_EN = {
  'error.notFound': 'Not found',
  'error.forbidden': 'Not allowed',
  'error.invalid': 'Invalid request',
  'error.badRequest': "Couldn't do that",
  'error.internal': 'Something went wrong',
  'error.unknownTool': 'Unknown tool',
  'error.cancelled': 'Cancelled',
  'label.loadTools': 'Getting ready',
  'summary.toolsLoaded': 'Ready',

  'label.listMyGames': 'Looking up your games',
  'label.listMyGamesPast': 'Looking at your past games',
  'label.searchGames': 'Searching games',
  'label.getGame': 'Opening the game',
  'label.getLeagueSeason': 'Opening the league',
  'label.getLeagueStandings': 'Checking the standings',
  'label.searchClubs': 'Looking up clubs',
  'label.getClub': 'Opening the club',
  'label.listCities': 'Looking up cities',
  'label.searchPlayers': 'Looking for players',
  'label.getPlayer': 'Opening the profile',
  'label.updateGame': 'Preparing a game change',
  'label.invitePlayers': 'Preparing invites',
  'label.joinGame': 'Preparing to join',
  'label.leaveGame': 'Preparing to leave',
  'label.createGame': 'Preparing a new game',

  'summary.games': 'Games found: {{count}}',
  'summary.clubs': 'Clubs found: {{count}}',
  'summary.cities': 'Cities found: {{count}}',
  'summary.players': 'Players found: {{count}}',
  'summary.standings': '{{title}}: standings ({{count}})',
  'summary.awaitingConfirmation': 'Waiting for your confirmation',

  'preview.update.title': 'Change "{{game}}"',
  'preview.invite.title': 'Invite to "{{game}}"',
  'preview.join.title': 'Join "{{game}}"',
  'preview.leave.title': 'Leave "{{game}}"',
  'preview.create.title': 'Create: {{type}}',

  'field.start': 'Start',
  'field.end': 'End',
  'field.when': 'When',
  'field.club': 'Club',
  'field.court': 'Court',
  'field.name': 'Name',
  'field.description': 'Description',
  'field.maxParticipants': 'Max players',
  'field.visibility': 'Visibility',
  'field.directJoin': 'Join without approval',
  'field.invitee': 'Invite',
  'field.sport': 'Sport',
  'field.type': 'Type',
  'field.format': 'Format',
  'field.level': 'Level',
  'field.players': 'Players',
  'field.yourPlace': 'You',

  'value.public': 'Public',
  'value.private': 'Private',
  'value.yes': 'Yes',
  'value.no': 'No',
  'value.notSet': 'Not set',
  'value.noCourt': 'No court',
  'value.player': 'Player',
  'value.queue': 'Join queue',
  'value.playerOrQueue': 'You\'ll be added as a player or to the join queue',
  'value.organizer': 'Organizer (not playing)',
  'value.going': 'Going',
  'value.invited': 'Invited',
  'value.notOnRoster': 'Not on the roster',

  'format.points': '{{points}} points',
  'format.bestOfSets': 'Best of {{sets}} sets',
  'format.singleSet': 'One set',
  'format.fast4': 'Fast4',
  'format.bestOfGames': 'Best of {{sets}} games to {{points}}',
  'format.oneGameTo': 'One game to {{points}}',
  'format.timer': '{{minutes}} min matches',
  'format.autoMatches': 'auto-generated matches (5 players or fewer)',
  'format.rated': 'Rated',
  'format.unrated': 'Not rated',

  'warn.notify': 'Players to be notified: {{count}}',
  'warn.past': 'This time is in the past',
  'warn.overlap': 'Overlaps your game "{{game}}" ({{time}})',
  'warn.courtCleared': 'The court will be cleared: it belongs to another club',
  'warn.queueApproval': 'The organizer has to accept you: you will join the queue',
  'warn.queueFull': 'The game is full: you will join the queue',
  'warn.queueLevel': 'Your level is outside the game\'s range: you will join the queue',
  'warn.ownerStays': 'You stay the organizer but no longer play',
  'warn.alreadyOnRoster': '{{name}} is already on the roster',
  'warn.alreadyInvited': '{{name}} is already invited',
  'warn.overCapacity': 'Confirmed players ({{count}}) exceed the new limit',
  'warn.visibleToAll': 'Everyone in the city will be able to find it',

  'result.updated': 'Game updated',
  'result.invited': 'Invites sent: {{count}}',
  'result.inviteNone': 'Nobody new to invite',
  'result.joined': 'You joined the game',
  'result.queued': 'You are in the join queue',
  'result.left': 'You left the game',
  'result.created': 'Game created',
  'result.declined': 'Cancelled, nothing changed',
  'result.expired': 'Expired, nothing changed',
  'result.superseded': 'Not confirmed, nothing changed',
  'result.failed': "Couldn't apply the change",
  'result.failedDetail': "Couldn't apply the change: {{detail}}",
  'result.failedNotFound': 'The game is no longer available',
  'result.failedForbidden': 'You are no longer allowed to do this',

  'action.expired': 'This confirmation has expired',
  'action.handled': 'This action was already handled',
} as const;

export type AgentI18nKey = keyof typeof AGENT_I18N_EN;
export type AgentI18nDictionary = Partial<Record<AgentI18nKey, string>>;

/** Base language code from a locale tag (`ru-RU` → `ru`); unknown → `en`. */
export function agentLang(locale: string | null | undefined): string {
  const base = (locale ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return (AGENT_LOCALES as readonly string[]).includes(base) ? base : 'en';
}

export function agentT(
  locale: string | null | undefined,
  key: AgentI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const lang = agentLang(locale);
  const template = AGENT_I18N_TRANSLATIONS[lang]?.[key] ?? AGENT_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** Localised name from the notification dictionary (`games.entityTypes.GAME`, `sport.padel`…). */
export function agentEnumLabel(locale: string | null | undefined, key: string, fallback: string): string {
  const value = notificationT(key, agentLang(locale));
  return value && value !== key ? value : fallback;
}

const SPORT_KEYS: Record<string, string> = {
  PADEL: 'sport.padel',
  TENNIS: 'sport.tennis',
  PICKLEBALL: 'sport.pickleball',
  BADMINTON: 'sport.badminton',
  TABLE_TENNIS: 'sport.tableTennis',
  SQUASH: 'sport.squash',
};

export function agentSportLabel(locale: string | null | undefined, sport: string): string {
  return agentEnumLabel(locale, SPORT_KEYS[sport] ?? `sport.${sport.toLowerCase()}`, sport);
}

export function agentEntityTypeLabel(locale: string | null | undefined, entityType: string): string {
  return agentEnumLabel(locale, `games.entityTypes.${entityType}`, entityType);
}

export function agentGameTypeLabel(locale: string | null | undefined, gameType: string): string {
  return agentEnumLabel(locale, `games.gameTypes.${gameType}`, gameType);
}

/** "Sat 3 Oct, 18:00" in the city timezone and the user's language. */
export function formatAgentDateTime(date: Date, timezone: string, locale: string | null | undefined): string {
  const intlLocale = resolveIntlLocale(agentLang(locale));
  try {
    return new Intl.DateTimeFormat(intlLocale, {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
