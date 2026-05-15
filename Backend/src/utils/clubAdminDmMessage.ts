import { TranslationService } from '../services/chat/translation.service';
import { t } from './translations';

export type ClubAdminDmMode = 'cancel' | 'clear';

export function buildClubAdminDmMessage(params: {
  mode: ClubAdminDmMode;
  lang?: string | null;
  hostName: string;
  clubName: string;
  date: string;
  time: string;
  reason: string;
  note?: string;
}): string {
  const lang = TranslationService.extractLanguageCode(params.lang || 'en');
  const key =
    params.mode === 'clear' ? 'clubAdmin.dm.courtCleared' : 'clubAdmin.dm.courtCancelled';
  const notePart = params.note?.trim() ? ` ${params.note.trim()}` : '';
  return t(key, lang)
    .replace(/\{\{hostName\}\}/g, params.hostName || 'there')
    .replace(/\{\{club\}\}/g, params.clubName || 'the club')
    .replace(/\{\{date\}\}/g, params.date)
    .replace(/\{\{time\}\}/g, params.time)
    .replace(/\{\{reason\}\}/g, params.reason)
    .replace(/\{\{note\}\}/g, notePart);
}
