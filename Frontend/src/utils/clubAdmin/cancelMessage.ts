import i18n from '@/i18n/config';

function applyDmTemplate(
  template: string,
  vars: { hostName: string; club: string; date: string; time: string; reason: string; note: string }
): string {
  return template
    .replace(/\{\{hostName\}\}/g, vars.hostName)
    .replace(/\{\{club\}\}/g, vars.club)
    .replace(/\{\{date\}\}/g, vars.date)
    .replace(/\{\{time\}\}/g, vars.time)
    .replace(/\{\{reason\}\}/g, vars.reason)
    .replace(/\{\{note\}\}/g, vars.note);
}

export function buildClubAdminDmPreview(params: {
  mode: 'cancel' | 'clear';
  hostFirstName: string | null;
  clubName: string;
  date: string;
  time: string;
  reason?: string;
  note?: string;
}): string {
  const hostName = params.hostFirstName?.trim() || 'there';
  const reason = params.reason?.trim() || '…';
  const notePart = params.note?.trim() ? ` ${params.note.trim()}` : '';
  const key =
    params.mode === 'clear' ? 'clubAdmin.dm.courtCleared' : 'clubAdmin.dm.courtCancelled';
  const template = i18n.t(key);
  return applyDmTemplate(template, {
    hostName,
    club: params.clubName,
    date: params.date,
    time: params.time,
    reason,
    note: notePart,
  });
}

export function formatSlotDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d),
    time: new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d),
  };
}
