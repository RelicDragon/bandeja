import { useTranslation } from 'react-i18next';
import type { BookingItem, ClubAdminPersonRef, ScheduleSlotV2 } from '@shared/clubAdmin/contract';

export function personName(p: Pick<ClubAdminPersonRef, 'firstName' | 'lastName'> | null | undefined): string {
  if (!p) return '';
  const first = p.firstName?.trim() ?? '';
  const last = p.lastName?.trim() ?? '';
  if (first && last) return `${first} ${last.charAt(0)}.`;
  return first || last;
}

export type BookingLike = BookingItem | ScheduleSlotV2;

function kindOf(b: BookingLike): 'game' | 'hold' | 'external' {
  if ('kind' in b) return b.kind;
  return b.type === 'game_court' ? 'game' : b.type;
}

/** Visual kind used for colour + pattern (shared by grid, rows, legend). */
export type BookingVisual = 'game' | 'planned' | 'hold' | 'external' | 'unassigned';

export function bookingVisual(b: BookingLike): BookingVisual {
  const kind = kindOf(b);
  if (kind === 'hold') return 'hold';
  if (kind === 'external') return 'external';
  if (b.courtId === null) return 'unassigned';
  const booked = 'kind' in b ? (b.kind === 'game' ? b.hasBookedCourt : false) : 'hasBookedCourt' in b ? b.hasBookedCourt : false;
  return booked ? 'game' : 'planned';
}

export const VISUAL_CLASS: Record<BookingVisual, string> = {
  game: 'bg-ca-game text-ca-game-fg',
  planned: 'bg-ca-planned text-ca-planned-fg border border-dashed border-primary-500/60',
  hold: 'bg-stripes text-ca-hold-fg',
  external: 'bg-dots text-ca-external-fg',
  unassigned: 'bg-ca-warn-bg text-ca-warn border border-dashed border-ca-warn',
};

export function useBookingText() {
  const { t } = useTranslation('clubAdmin');
  const title = (b: BookingLike): string => {
    const kind = kindOf(b);
    if (kind === 'hold') {
      const h = b as Extract<BookingLike, { holdId: string }>;
      return h.customerName?.trim() || t(`holdLabel.${h.label}`);
    }
    if (kind === 'external') return t('kind.external');
    const g = b as Extract<BookingLike, { gameId: string }>;
    return g.name?.trim() || t('kind.gameBy', { name: personName(g.host) || t('kind.game') });
  };
  const detail = (b: BookingLike): string => {
    const kind = kindOf(b);
    if (kind === 'hold') {
      const h = b as Extract<BookingLike, { holdId: string }>;
      return [h.customerName ? t(`holdLabel.${h.label}`) : null, h.note].filter(Boolean).join(' · ');
    }
    if (kind === 'external') return t('kind.externalHint');
    const g = b as Extract<BookingLike, { gameId: string }>;
    const players =
      typeof g.maxParticipants === 'number' && g.maxParticipants > 0
        ? t('kind.playersOf', { count: g.participantCount, max: g.maxParticipants })
        : t('kind.players', { count: g.participantCount });
    const reserved = g.hasBookedCourt ? t('kind.reserved') : t('kind.planned');
    return `${players} · ${reserved}`;
  };
  return { title, detail, kindOf };
}
