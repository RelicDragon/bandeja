import { useContext } from 'react';
import {
  ReservationGridSyncContext,
  type ReservationGridSyncValue,
} from './reservationGridSync.context';

export function useReservationGridSync(): ReservationGridSyncValue | null {
  return useContext(ReservationGridSyncContext);
}
