import type { EventKind } from '@/types';

export type EventHeroDraft = {
  originalUrl: string;
  thumbnailUrl: string;
};

export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string {
  const d = new Date(value);
  return d.toISOString();
}

export const EVENT_KIND_OPTIONS: EventKind[] = ['CAMP', 'TOURNAMENT', 'LEAGUE'];
