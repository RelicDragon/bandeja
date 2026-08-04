export type BookingAuthProvider = 'BOOKTIME' | 'PADELOO' | 'KLIKTEREN';

export type BookingAuthInvalidation = {
  clubId: string;
  provider: BookingAuthProvider;
};

type Listener = (event: BookingAuthInvalidation) => void;

const listeners = new Set<Listener>();

export function onBookingAuthInvalidated(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitBookingAuthInvalidated(event: BookingAuthInvalidation): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* listener must not break invalidation */
    }
  });
}
