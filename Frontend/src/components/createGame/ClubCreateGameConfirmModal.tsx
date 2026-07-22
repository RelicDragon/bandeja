import type { ComponentProps } from 'react';
import { isKlikterenClub, isPadelooClub } from '@shared/clubIntegration';
import { BooktimeCreateGameConfirmModal } from './BooktimeCreateGameConfirmModal';
import { PadelooCreateGameConfirmModal } from './PadelooCreateGameConfirmModal';
import { KlikterenCreateGameConfirmModal } from './KlikterenCreateGameConfirmModal';

export type ClubCreateGameConfirmModalProps =
  | ({ provider: 'BOOKTIME' } & ComponentProps<typeof BooktimeCreateGameConfirmModal>)
  | ({
      provider: 'PADELOO';
      padelooClubId: number;
      email: string | null;
    } & Omit<ComponentProps<typeof PadelooCreateGameConfirmModal>, 'padelooClubId' | 'email'>)
  | ({
      provider: 'KLIKTEREN';
      klikterenVenueId: string;
      email: string | null;
    } & Omit<ComponentProps<typeof KlikterenCreateGameConfirmModal>, 'klikterenVenueId' | 'email'>);

export function ClubCreateGameConfirmModal(props: ClubCreateGameConfirmModalProps) {
  if (props.provider === 'KLIKTEREN' || isKlikterenClub(props.club)) {
    const { provider: _provider, klikterenVenueId, email, ...rest } = props as Extract<
      ClubCreateGameConfirmModalProps,
      { provider: 'KLIKTEREN' }
    >;
    return (
      <KlikterenCreateGameConfirmModal klikterenVenueId={klikterenVenueId} email={email} {...rest} />
    );
  }

  if (props.provider === 'PADELOO' || isPadelooClub(props.club)) {
    const { provider: _provider, padelooClubId, email, ...rest } = props as Extract<
      ClubCreateGameConfirmModalProps,
      { provider: 'PADELOO' }
    >;
    return <PadelooCreateGameConfirmModal padelooClubId={padelooClubId} email={email} {...rest} />;
  }

  const { provider: _provider, ...booktimeProps } = props as Extract<
    ClubCreateGameConfirmModalProps,
    { provider: 'BOOKTIME' }
  >;
  return <BooktimeCreateGameConfirmModal {...booktimeProps} />;
}
