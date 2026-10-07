/**
 * Club booking lists (My tab, Connected clubs, Courts card "your bookings") cache each
 * provider's upcoming list. After any booking or cancellation at a club they must refetch,
 * or the user does not see what they just booked (or still sees what they cancelled).
 */

/** Drop every provider list cache and tell the list hooks to reload. Never throws. */
export async function refreshClubBookingLists(): Promise<void> {
  try {
    const [padeloo, klikteren, booktime] = await Promise.all([
      import('@/integrations/padeloo/padelooAllUpcomingLoader'),
      import('@/integrations/klikteren/klikterenAllUpcomingLoader'),
      import('@/integrations/booktime/booktimeAllUpcomingLoader'),
    ]);
    padeloo.invalidatePadelooUpcomingCache();
    klikteren.invalidateKlikterenUpcomingCache();
    // Last: also resets the shared list hooks, which reload on their next render.
    booktime.invalidateBooktimeAllUpcomingCache();
  } catch (err) {
    console.error('Club booking lists refresh failed', err);
  }
}

/** Provider caches only (no hook reset): for a list reload that refetches right away. */
export async function clearClubBookingListCaches(): Promise<void> {
  const [padeloo, klikteren, booktime] = await Promise.all([
    import('@/integrations/padeloo/padelooAllUpcomingLoader'),
    import('@/integrations/klikteren/klikterenAllUpcomingLoader'),
    import('@/integrations/booktime/booktimeAllUpcomingLoader'),
  ]);
  padeloo.invalidatePadelooUpcomingCache();
  klikteren.invalidateKlikterenUpcomingCache();
  booktime.clearBooktimeAllUpcomingCache();
}
