export type CalendarEventInput = {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  url?: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatUtcDateTimeBasic = (date: Date) => {
  const d = new Date(date);
  return (
    `${d.getUTCFullYear()}` +
    `${pad2(d.getUTCMonth() + 1)}` +
    `${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
};

const escapeIcsText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const foldIcsLine = (line: string) => {
  const max = 75;
  if (line.length <= max) return [line];
  const parts: string[] = [];
  let i = 0;
  parts.push(line.slice(0, max));
  i = max;
  while (i < line.length) {
    parts.push(` ${line.slice(i, i + max - 1)}`);
    i += max - 1;
  }
  return parts;
};

const buildIcsLines = (lines: string[]) =>
  lines.flatMap(foldIcsLine).join('\r\n') + '\r\n';

const getUid = () => {
  const g = globalThis as any;
  const uuid = g?.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const buildGoogleCalendarUrl = (event: CalendarEventInput) => {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const dates = `${formatUtcDateTimeBasic(event.start)}/${formatUtcDateTimeBasic(event.end)}`;

  const details = event.description || '';

  const params = new URLSearchParams();
  params.set('text', event.title);
  params.set('dates', dates);
  if (details) params.set('details', details);
  if (event.location) params.set('location', event.location);
  if (event.url) params.set('sprop', `website:${event.url}`);

  return `${base}&${params.toString()}`;
};

export const buildIcsContent = (event: CalendarEventInput) => {
  const dtStamp = formatUtcDateTimeBasic(new Date());
  const dtStart = formatUtcDateTimeBasic(event.start);
  const dtEnd = formatUtcDateTimeBasic(event.end);

  const description = event.description || '';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PadelPulse//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${getUid()}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (event.url) lines.push(`URL:${escapeIcsText(event.url)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return buildIcsLines(lines);
};

export const downloadIcsEvent = (event: CalendarEventInput, filename: string) => {
  const ics = buildIcsContent(event);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.toLowerCase().endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
};


