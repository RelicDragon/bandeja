/**
 * Club admin console — HTTP contract shared by Backend (`@bandeja/shared/clubAdmin/contract`)
 * and Frontend (`@shared/clubAdmin/contract`).
 *
 * All endpoints live under `/api/club-admin/clubs/:clubId/...` unless noted.
 * Every instant is an ISO-8601 UTC string. Every calendar date is a club-local `yyyy-MM-dd`.
 * Every wall-clock time is club-local `HH:mm`. Money is integer minor units (`*Cents`) plus a currency.
 *
 * Compatibility: store builds still call the legacy endpoints (`/schedule`, `/reservations`,
 * `/courts`, `/holds`, `/games/:id/cancel|clear-court`, `PATCH /clubs/:clubId`, `/courts/:courtId`,
 * `/holds/:holdId`). Those keep their shapes; new fields may only be *added* to them.
 */

// ---------------------------------------------------------------------------
// Roles & capabilities
// ---------------------------------------------------------------------------

export type ClubAdminRole = 'ADMIN' | 'STAFF';

export const CLUB_ADMIN_CAPABILITIES = [
  'schedule.view',
  'schedule.edit',
  'bookings.view',
  'billing.collect',
  'billing.configure',
  'reports.view',
  'reports.revenue',
  'club.edit',
  'courts.edit',
  'team.manage',
  'activity.view',
  'reviews.view',
] as const;

export type ClubAdminCapability = (typeof CLUB_ADMIN_CAPABILITIES)[number];

/** STAFF = front desk: schedule, bookings, taking payments. No settings, team, reports or revenue. */
export const CLUB_ADMIN_ROLE_CAPABILITIES: Record<ClubAdminRole, readonly ClubAdminCapability[]> = {
  ADMIN: CLUB_ADMIN_CAPABILITIES,
  STAFF: ['schedule.view', 'schedule.edit', 'bookings.view', 'billing.collect'],
};

export function clubAdminCan(role: ClubAdminRole, capability: ClubAdminCapability): boolean {
  return CLUB_ADMIN_ROLE_CAPABILITIES[role].includes(capability);
}

// ---------------------------------------------------------------------------
// Errors — body `{ success: false, message, code, details? }`
// ---------------------------------------------------------------------------

export type ClubAdminErrorCode =
  | 'clubAdmin.forbidden'
  | 'clubAdmin.capability'
  | 'clubAdmin.notFound'
  | 'clubAdmin.validation'
  | 'clubAdmin.holdOverlap'
  | 'clubAdmin.holdInPast'
  | 'clubAdmin.courtInactive'
  | 'clubAdmin.resultsEntered'
  | 'clubAdmin.entityTypeLocked'
  | 'clubAdmin.lastAdmin'
  | 'clubAdmin.alreadyMember'
  | 'clubAdmin.chargeExists'
  | 'clubAdmin.chargeVoid'
  | 'clubAdmin.paymentExceedsBalance'
  | 'clubAdmin.rangeTooLarge';

export interface ClubAdminValidationDetail {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type PriceCurrency = string; // Prisma `PriceCurrency` enum value (EUR, USD, RSD, ...)

export interface ClubAdminPersonRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
}

export interface ClubAdminCourtRef {
  id: string;
  name: string;
  isIndoor: boolean;
  sport: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Paged<T> {
  items: T[];
  /** Opaque keyset cursor; `null` means no more pages. */
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Context — GET /context
// ---------------------------------------------------------------------------

export interface ClubAdminContext {
  club: {
    id: string;
    name: string;
    avatar: string | null;
    cityName: string;
    timezone: string;
    currency: PriceCurrency;
    integrationType: string | null;
    isActive: boolean;
  };
  role: ClubAdminRole;
  capabilities: ClubAdminCapability[];
  /** Club-local date of "now". Use this, never the device date, for "today". */
  today: string;
  setup: ClubSetupChecklist;
}

export interface ClubSetupChecklist {
  hasCourts: boolean;
  hasHours: boolean;
  hasPrices: boolean;
  hasPhotos: boolean;
  hasContacts: boolean;
}

// ---------------------------------------------------------------------------
// Opening hours — GET/PUT /hours
// ---------------------------------------------------------------------------

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ClubWeeklyHoursDay {
  weekday: IsoWeekday;
  closed: boolean;
  /** `HH:mm`. */
  open: string;
  /** `HH:mm`. `close <= open` means the day runs past midnight (e.g. 08:00–01:00). `00:00` = midnight. */
  close: string;
}

export interface ClubClosure {
  id: string;
  date: string;
  /** Null = closed all day; otherwise special hours for that date. */
  open: string | null;
  close: string | null;
  note: string | null;
}

export interface ClubHours {
  weekly: ClubWeeklyHoursDay[]; // always 7 entries, weekday 1..7
  closures: ClubClosure[]; // upcoming only (date >= today), ascending
  /** True when weekly rows exist; false = derived from legacy `openingTime`/`closingTime`. */
  configured: boolean;
}

export interface PutClubHoursBody {
  weekly: ClubWeeklyHoursDay[];
  closures: Array<Omit<ClubClosure, 'id'> & { id?: string }>;
}

/** Resolved hours for one club-local date. `null` = closed. */
export interface ClubDayHours {
  open: string;
  close: string;
  /** Instants of the opening window (close may be on the next calendar day). */
  openAt: string;
  closeAt: string;
}

// ---------------------------------------------------------------------------
// Schedule — GET /schedule?date=yyyy-MM-dd  (legacy endpoint, additive fields)
// ---------------------------------------------------------------------------

export type HoldLabel = 'WALK_IN' | 'PHONE' | 'ACADEMY' | 'MAINTENANCE' | 'OTHER';

export interface ScheduleGameSlot {
  type: 'game' | 'game_court';
  gameId: string;
  courtId: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  status: string;
  entityType: string;
  name: string | null;
  host: ClubAdminPersonRef;
  participantCount: number;
  /** Added in console v2. */
  maxParticipants?: number | null;
  billing?: BookingBillingSummary | null;
}

export interface ScheduleExternalSlot {
  type: 'external';
  courtId: string;
  courtName: string | null;
  startTime: string;
  endTime: string;
}

export interface ScheduleHoldSlot {
  type: 'hold';
  holdId: string;
  courtId: string;
  label: HoldLabel;
  note: string | null;
  startTime: string;
  endTime: string;
  /** Added in console v2. */
  seriesId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  billing?: BookingBillingSummary | null;
}

export type ScheduleSlotV2 = ScheduleGameSlot | ScheduleExternalSlot | ScheduleHoldSlot;

export interface ClubScheduleResponseV2 {
  slots: ScheduleSlotV2[];
  conflicts: Array<{ courtId: string; startTime: string; endTime: string; kinds: string[] }>;
  isLoadingExternalSlots: boolean;
  externalSlotsFailed?: boolean;
  snapshotFetchedAt?: string | null;
  hasSnapshotForDate?: boolean;
  unmappedExternalCourtCount?: number;
  /** Added in console v2. */
  date?: string;
  timezone?: string;
  hours?: ClubDayHours | null;
  slotMinutes?: number;
  courts?: ClubAdminCourtRef[];
}

// ---------------------------------------------------------------------------
// Holds — POST /holds, PATCH/DELETE /holds/:holdId (club-scoped v2 paths)
// ---------------------------------------------------------------------------

export interface CreateHoldBody {
  courtId: string;
  startTime: string;
  endTime: string;
  label: HoldLabel;
  note?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Repeat weekly for N occurrences total (1 = no repeat, max 26). */
  repeatWeeks?: number;
  /**
   * Opt in to overlap detection (409 `clubAdmin.holdOverlap`). Store builds never send it and keep the
   * legacy "always create" behaviour, because they swallow non-403 errors.
   */
  detectOverlap?: boolean;
  /** With `detectOverlap`: create even when it overlaps games/holds/external bookings. */
  force?: boolean;
}

export interface HoldOverlapDetails {
  overlaps: Array<{ kind: 'game' | 'hold' | 'external'; courtId: string; startTime: string; endTime: string; id: string | null }>;
}

export interface CreateHoldResponse {
  holdIds: string[];
  seriesId: string | null;
  /** Occurrences skipped because they overlapped (only when repeatWeeks > 1 and !force). */
  skipped: Array<{ startTime: string; endTime: string }>;
}

export type UpdateHoldBody = Partial<Pick<CreateHoldBody, 'courtId' | 'startTime' | 'endTime' | 'label' | 'note' | 'customerName' | 'customerPhone' | 'force'>>;

/** DELETE /holds/:holdId?scope=one|following */
export type HoldDeleteScope = 'one' | 'following';

// ---------------------------------------------------------------------------
// Games — cancel / clear (legacy paths kept; v2 adds error codes)
// ---------------------------------------------------------------------------

export interface CancelGameBody {
  reason: string;
  note?: string | null;
  /** Message sent to the host. Server builds a default in the host's language when omitted. */
  message?: string | null;
  notifyHost?: boolean;
}

// ---------------------------------------------------------------------------
// Bookings — GET /bookings
// ---------------------------------------------------------------------------

export type BookingKind = 'game' | 'hold' | 'external';
export type BookingScope = 'upcoming' | 'past';

export interface BookingsQuery {
  scope: BookingScope;
  from?: string; // club-local date
  to?: string; // club-local date (inclusive)
  courtId?: string;
  kinds?: BookingKind[];
  payment?: ChargeStatus | 'NONE';
  q?: string;
  cursor?: string;
  limit?: number; // default 30, max 100
}

export interface BookingBillingSummary {
  /** Price from the club's price rules for this court/time. Null when no price is configured. */
  quoteCents: number | null;
  chargeId: string | null;
  status: ChargeStatus | null;
  amountCents: number | null;
  paidCents: number;
  currency: PriceCurrency;
}

export interface BookingItemBase {
  id: string; // `${kind}:${sourceId}` — stable list key
  kind: BookingKind;
  courtId: string | null;
  courtName: string | null;
  startTime: string;
  endTime: string;
  billing: BookingBillingSummary | null;
}

export interface GameBookingItem extends BookingItemBase {
  kind: 'game';
  gameId: string;
  name: string | null;
  status: string;
  entityType: string;
  hasBookedCourt: boolean;
  host: ClubAdminPersonRef;
  participantCount: number;
  maxParticipants: number | null;
}

export interface HoldBookingItem extends BookingItemBase {
  kind: 'hold';
  holdId: string;
  seriesId: string | null;
  label: HoldLabel;
  note: string | null;
  customerName: string | null;
  customerPhone: string | null;
}

export interface ExternalBookingItem extends BookingItemBase {
  kind: 'external';
  provider: string;
}

export type BookingItem = GameBookingItem | HoldBookingItem | ExternalBookingItem;

// ---------------------------------------------------------------------------
// Dashboard — GET /dashboard
// ---------------------------------------------------------------------------

export interface ClubDashboard {
  date: string;
  timezone: string;
  now: string;
  hours: ClubDayHours | null;
  kpis: {
    occupancyPct: number; // 0..100, booked court-minutes / open court-minutes
    bookedMinutes: number;
    openMinutes: number;
    games: number;
    players: number;
    holds: number;
    externalBookings: number;
    /** Present only with `reports.revenue`. */
    expectedRevenueCents?: number | null;
    collectedCents?: number | null;
    currency: PriceCurrency;
  };
  attention: AttentionItem[];
  upNext: BookingItem[]; // next 6 starting at/after now today (and in progress)
  week: Array<{ date: string; occupancyPct: number; bookedMinutes: number }>; // today + next 6 days
}

export type AttentionItem =
  | { kind: 'conflict'; count: number; date: string }
  | { kind: 'sync_failed'; provider: string | null }
  | { kind: 'unmapped_courts'; count: number }
  | { kind: 'game_without_court'; count: number; date: string }
  | { kind: 'unpaid_past'; count: number; amountCents: number; currency: PriceCurrency }
  | { kind: 'new_reviews'; count: number; averageStars: number | null }
  | { kind: 'setup'; missing: Array<keyof ClubSetupChecklist> };

// ---------------------------------------------------------------------------
// Club profile — GET/PATCH /profile
// ---------------------------------------------------------------------------

export interface ClubProfile {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  photos: string[];
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  amenities: string[];
  sports: string[];
  policyText: string | null;
  defaultSlotMinutes: number;
  cancellationNoticeHours: number | null;
  currency: PriceCurrency;
  integrationType: string | null;
  integrationHealthy: boolean | null;
}

export type PatchClubProfileBody = Partial<
  Pick<
    ClubProfile,
    | 'name'
    | 'description'
    | 'phone'
    | 'email'
    | 'website'
    | 'address'
    | 'latitude'
    | 'longitude'
    | 'amenities'
    | 'sports'
    | 'policyText'
    | 'defaultSlotMinutes'
    | 'cancellationNoticeHours'
    | 'currency'
    | 'photos'
  >
>;

// ---------------------------------------------------------------------------
// Courts — GET/POST /courts, PATCH /courts/:courtId, POST /courts/reorder, GET /courts/:courtId/impact
// ---------------------------------------------------------------------------

export interface ClubAdminCourt extends ClubAdminCourtRef {
  courtType: string | null;
  surfaceType: string | null;
  webCameraUrl: string | null;
  /** Legacy single price, still honoured as the court's fallback rate. */
  pricePerHourCents: number | null;
  externalCourtId: string | null;
  integrationCourtName: string | null;
}

export interface UpsertCourtBody {
  name: string;
  sport?: string | null;
  courtType?: string | null;
  surfaceType?: string | null;
  isIndoor?: boolean;
  isActive?: boolean;
  webCameraUrl?: string | null;
  pricePerHourCents?: number | null;
}

export interface CourtImpact {
  futureGames: number;
  futureHolds: number;
  nextBookingAt: string | null;
}

// ---------------------------------------------------------------------------
// Pricing — GET/PUT /pricing
// ---------------------------------------------------------------------------

export interface ClubPriceRule {
  id: string;
  /** Null = every court. Court-specific rules beat club-wide ones; later `startMinute` breaks ties. */
  courtId: string | null;
  label: string | null;
  weekdays: IsoWeekday[];
  /** Minutes from club-local midnight, [startMinute, endMinute). endMinute may be 1440. */
  startMinute: number;
  endMinute: number;
  pricePerHourCents: number;
}

export interface ClubPricing {
  currency: PriceCurrency;
  rules: ClubPriceRule[];
  /** Hold labels that create billable bookings. MAINTENANCE is never billable. */
  billableHoldLabels: HoldLabel[];
}

export interface PutClubPricingBody {
  currency: PriceCurrency;
  rules: Array<Omit<ClubPriceRule, 'id'> & { id?: string }>;
  billableHoldLabels: HoldLabel[];
}

/** GET /pricing/quote?courtId&startTime&endTime */
export interface PriceQuote {
  amountCents: number | null;
  currency: PriceCurrency;
  breakdown: Array<{ ruleId: string | null; minutes: number; pricePerHourCents: number }>;
}

// ---------------------------------------------------------------------------
// Billing — charges & payments
//   POST /charges                      { source, amountCents?, description? } -> ClubCharge (amount defaults to quote)
//   GET  /charges/:chargeId
//   PATCH /charges/:chargeId           { amountCents?, description?, status?: 'WAIVED' | 'VOID' }
//   POST /charges/:chargeId/payments   RecordPaymentBody -> ClubCharge
//   DELETE /charges/:chargeId/payments/:paymentId  (void a payment) -> ClubCharge
// ---------------------------------------------------------------------------

export type ChargeStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'WAIVED' | 'VOID';
export type ClubPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER';

export type ChargeSource =
  | { kind: 'game'; gameId: string }
  | { kind: 'hold'; holdId: string }
  | { kind: 'manual'; courtId?: string | null; startTime?: string | null; endTime?: string | null };

export interface ClubPayment {
  id: string;
  amountCents: number; // > 0
  method: ClubPaymentMethod;
  paidAt: string;
  payerName: string | null;
  payerUserId: string | null;
  note: string | null;
  recordedBy: ClubAdminPersonRef;
  voidedAt: string | null;
}

export interface ClubCharge {
  id: string;
  source: ChargeSource;
  courtId: string | null;
  courtName: string | null;
  startTime: string | null;
  endTime: string | null;
  description: string | null;
  amountCents: number;
  paidCents: number;
  currency: PriceCurrency;
  status: ChargeStatus;
  payments: ClubPayment[];
  createdAt: string;
  createdBy: ClubAdminPersonRef;
}

export interface CreateChargeBody {
  source: ChargeSource;
  amountCents?: number;
  description?: string | null;
}

export interface PatchChargeBody {
  amountCents?: number;
  description?: string | null;
  status?: 'WAIVED' | 'VOID';
}

export interface RecordPaymentBody {
  amountCents: number;
  method: ClubPaymentMethod;
  paidAt?: string;
  payerName?: string | null;
  payerUserId?: string | null;
  note?: string | null;
}

/** GET /payments?from&to&method&cursor — the cash-up / payments ledger. */
export interface PaymentLedgerItem extends ClubPayment {
  chargeId: string;
  chargeDescription: string | null;
  courtName: string | null;
  bookingStartTime: string | null;
}

export interface PaymentLedgerResponse extends Paged<PaymentLedgerItem> {
  totals: { collectedCents: number; byMethod: Partial<Record<ClubPaymentMethod, number>>; currency: PriceCurrency };
}

// ---------------------------------------------------------------------------
// Reports — GET /reports?from&to&compare=1   (requires reports.view; revenue block requires reports.revenue)
//           GET /reports/export.csv?from&to&dataset=bookings|payments|players
// ---------------------------------------------------------------------------

export interface ClubReportPeriod {
  from: string;
  to: string; // inclusive
  days: number;
}

export interface ClubReportMetrics {
  occupancy: { pct: number; bookedMinutes: number; openMinutes: number };
  games: {
    total: number;
    byEntityType: Record<string, number>;
    cancelled: number;
    noShows: number;
  };
  holds: { total: number; byLabel: Partial<Record<HoldLabel, number>> };
  players: { unique: number; new: number; returning: number };
  revenue?: {
    currency: PriceCurrency;
    expectedCents: number;
    chargedCents: number;
    collectedCents: number;
    outstandingCents: number;
    byMethod: Partial<Record<ClubPaymentMethod, number>>;
  };
  reviews: { count: number; averageStars: number | null };
}

export interface ClubReport {
  period: ClubReportPeriod;
  timezone: string;
  current: ClubReportMetrics;
  previous: ClubReportMetrics | null;
  /** [weekday 0=Mon..6=Sun][hour 0..23] occupancy percent over the period. */
  heatmap: number[][];
  perCourt: Array<{ courtId: string; name: string; occupancyPct: number; bookedMinutes: number; games: number; collectedCents?: number }>;
  daily: Array<{ date: string; occupancyPct: number; bookedMinutes: number; games: number; players: number; collectedCents?: number }>;
  /** Public profiles only (active, name set), blocks honoured. No contact data. */
  topRegulars: Array<{ user: ClubAdminPersonRef; games: number }>;
  ratingTrend: Array<{ weekStart: string; averageStars: number | null; count: number }>;
}

export const CLUB_REPORT_MAX_DAYS = 366;

// ---------------------------------------------------------------------------
// Team — GET/POST /team, PATCH/DELETE /team/:userId   (team.manage)
// ---------------------------------------------------------------------------

export interface ClubTeamMember {
  user: ClubAdminPersonRef;
  role: ClubAdminRole;
  addedAt: string;
  isSelf: boolean;
}

export interface AddTeamMemberBody {
  userId: string;
  role: ClubAdminRole;
}

// ---------------------------------------------------------------------------
// Activity — GET /activity?cursor&action   (activity.view)
// ---------------------------------------------------------------------------

export type ClubActivityAction =
  | 'HOLD_CREATED'
  | 'HOLD_UPDATED'
  | 'HOLD_DELETED'
  | 'GAME_CANCELLED'
  | 'COURT_CLEARED'
  | 'COURT_CREATED'
  | 'COURT_UPDATED'
  | 'COURTS_REORDERED'
  | 'CLUB_UPDATED'
  | 'HOURS_UPDATED'
  | 'PRICING_UPDATED'
  | 'CHARGE_CREATED'
  | 'CHARGE_UPDATED'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_VOIDED'
  | 'TEAM_ADDED'
  | 'TEAM_REMOVED'
  | 'TEAM_ROLE_CHANGED';

export interface ClubActivityItem {
  id: string;
  action: ClubActivityAction;
  actor: ClubAdminPersonRef;
  createdAt: string;
  /** Short, already-safe summary values for rendering, e.g. `{ court: 'Court 2', startTime, amountCents }`. */
  meta: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------------
// Reviews — GET /reviews?cursor
// ---------------------------------------------------------------------------

export interface ClubAdminReview {
  id: string;
  stars: number;
  text: string | null;
  photos: string[];
  createdAt: string;
  author: ClubAdminPersonRef;
  gameId: string | null;
}

export interface ClubAdminReviewsResponse extends Paged<ClubAdminReview> {
  summary: { averageStars: number | null; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> };
}
