/** Booktime list APIs use 0 when price is unknown — not a real quote. */
export function booktimeBookingListPrice(price: number | undefined | null): number | undefined {
  if (price == null || !Number.isFinite(price) || price <= 0) return undefined;
  return price;
}
