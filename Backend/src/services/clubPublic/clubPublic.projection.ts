/**
 * PRD 354 — guest-readable club projection.
 *
 * `GET /clubs/:id` returns the **raw** `Club` row (CONTRACT §1), which includes
 * `integrationConfig` — booking-provider credentials and venue ids — and
 * `ptMeta`. This module exists so the public club page never reads from that
 * shape.
 *
 * The rule here is a **whitelist**: `PUBLIC_CLUB_SELECT` / `PUBLIC_COURT_SELECT`
 * are Prisma `select` objects, so a column added to the schema tomorrow is
 * absent from this payload until somebody deliberately adds it. The denylist in
 * `PUBLIC_CLUB_FORBIDDEN_KEYS` is a second belt, asserted by
 * `clubPublic.projection.test.ts` — it is not the primary defence.
 *
 * House pattern for the same discipline on the Find card:
 * `Backend/src/services/game/availableGamesCard.projection.ts`.
 */
import type { ClubIntegrationType, Prisma } from '@prisma/client';
import { clubHasBookingIntegration } from '@bandeja/shared/clubIntegration';

/** Operator-only fields that must never reach a guest (or any) public payload. */
export const PUBLIC_CLUB_FORBIDDEN_KEYS = [
  'integrationConfig',
  'ptMeta',
  'pt_meta',
  'normalizedName',
  'originalAvatar',
  'isActive',
] as const;

/** Operator-only court fields. `externalCourtId` maps a court into the provider. */
export const PUBLIC_COURT_FORBIDDEN_KEYS = ['externalCourtId', 'isActive'] as const;

export const PUBLIC_COURT_SELECT = {
  id: true,
  name: true,
  sport: true,
  courtType: true,
  isIndoor: true,
  surfaceType: true,
  pricePerHour: true,
  webCameraUrl: true,
  integrationCourtName: true,
} satisfies Prisma.CourtSelect;

export const PUBLIC_CLUB_SELECT = {
  id: true,
  name: true,
  description: true,
  avatar: true,
  photos: true,
  address: true,
  cityId: true,
  phone: true,
  email: true,
  website: true,
  latitude: true,
  longitude: true,
  openingTime: true,
  closingTime: true,
  amenities: true,
  isBar: true,
  isForPlaying: true,
  sports: true,
  clubRating: true,
  clubReviewCount: true,
  courtsNumber: true,
  defaultSlotMinutes: true,
  cancellationNoticeHours: true,
  policyText: true,
  // Read to derive `booking` only — deleted before the row is serialised.
  integrationType: true,
  integrationConfig: true,
  city: { select: { id: true, name: true, country: true, timezone: true } },
  courts: {
    where: { isActive: true },
    select: PUBLIC_COURT_SELECT,
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.ClubSelect;

export type PublicClubRow = Prisma.ClubGetPayload<{ select: typeof PUBLIC_CLUB_SELECT }>;

/**
 * Booking capability, never the configuration.
 *
 * `provider` is the `ClubIntegrationType` name only — the frontend needs it to
 * pick the right connect flow (`useClubBookingAuth` switches on it), and it
 * carries no secret. `available` is `clubHasBookingIntegration`, i.e. the config
 * both exists and parses.
 */
export type ClubBookingCapability = {
  available: boolean;
  provider: ClubIntegrationType | null;
};

export type PublicClubPhoto = { originalUrl: string; thumbnailUrl: string };

export type PublicClubPayload = Omit<
  PublicClubRow,
  'integrationType' | 'integrationConfig' | 'photos'
> & {
  photos: PublicClubPhoto[];
  carouselPhotos: PublicClubPhoto[];
  booking: ClubBookingCapability;
  /** Viewer-dependent. `false` for guests — never `undefined`, so the UI has no third state. */
  isFavorite: boolean;
  isAdmin: boolean;
};

export function buildClubBookingCapability(club: {
  integrationType?: ClubIntegrationType | null;
  integrationConfig?: unknown;
}): ClubBookingCapability {
  const available = clubHasBookingIntegration(club);
  return {
    available,
    // A club whose config is missing or malformed exposes no provider at all,
    // so the UI cannot offer a connect flow that would immediately fail.
    provider: available ? (club.integrationType ?? null) : null,
  };
}

/**
 * Strip the two integration columns and attach the derived, viewer-dependent
 * fields. This is the only function allowed to produce a public club payload.
 */
export function projectPublicClub(
  row: PublicClubRow,
  extras: {
    photos: PublicClubPhoto[];
    carouselPhotos: PublicClubPhoto[];
    isFavorite: boolean;
    isAdmin: boolean;
  },
): PublicClubPayload {
  const {
    integrationType: _integrationType,
    integrationConfig: _integrationConfig,
    photos: _rawPhotos,
    ...rest
  } = row;
  void _rawPhotos;

  return {
    ...rest,
    photos: extras.photos,
    carouselPhotos: extras.carouselPhotos,
    booking: buildClubBookingCapability({
      integrationType: _integrationType,
      integrationConfig: _integrationConfig,
    }),
    isFavorite: extras.isFavorite,
    isAdmin: extras.isAdmin,
  };
}

export type PublicClubContractIssue = { path: string; reason: string };

/**
 * Guardrail used by the tests (and cheap enough to call from a script): walks a
 * serialised payload and reports any operator-only key that survived.
 */
export function findPublicClubContractIssues(payload: unknown): PublicClubContractIssue[] {
  const issues: PublicClubContractIssue[] = [];
  if (!payload || typeof payload !== 'object') return issues;
  const club = payload as Record<string, unknown>;

  for (const key of PUBLIC_CLUB_FORBIDDEN_KEYS) {
    if (key in club) {
      issues.push({ path: key, reason: `${key} must not reach a public club payload` });
    }
  }

  const courts = club.courts;
  if (Array.isArray(courts)) {
    courts.forEach((court, index) => {
      if (!court || typeof court !== 'object') return;
      for (const key of PUBLIC_COURT_FORBIDDEN_KEYS) {
        if (key in (court as Record<string, unknown>)) {
          issues.push({
            path: `courts[${index}].${key}`,
            reason: `${key} must not reach a public court payload`,
          });
        }
      }
    });
  }

  const booking = club.booking;
  if (booking && typeof booking === 'object') {
    for (const key of Object.keys(booking as Record<string, unknown>)) {
      if (key !== 'available' && key !== 'provider') {
        issues.push({
          path: `booking.${key}`,
          reason: 'booking exposes capability only — available + provider',
        });
      }
    }
  }

  return issues;
}

export function assertPublicClubContract(payload: unknown): void {
  const issues = findPublicClubContractIssues(payload);
  if (issues.length > 0) {
    throw new Error(
      `Public club contract violated:\n${issues
        .map((i) => `  ${i.path}: ${i.reason}`)
        .join('\n')}`,
    );
  }
}
