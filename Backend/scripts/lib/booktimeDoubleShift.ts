import {
  BOOKTIME_DEFAULT_TIMEZONE,
  booktimeIngestToStoredUtcIso,
  booktimeWireFormatToStoredUtcIso,
  parseBooktimeLocalComponents,
  storedUtcIsoToInstant,
} from '../../src/shared/booktime/localTime';

const OFFSET_CANDIDATE_HOURS = [1, 2] as const;

function formatHourMinuteInZone(instant: Date, timeZone: string): { hour: number; minute: number } {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => formatted.find((p) => p.type === type)?.value ?? '0';
  return { hour: Number(get('hour')), minute: Number(get('minute')) };
}

function buildFakeZFromComponents(dateKey: string, hour: number, minute: number): string {
  return `${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

/**
 * If stored UTC is a double-wire-ingest artifact, return corrected stored UTC ISO.
 * Uses Belgrade wall clock: wrong rows satisfy wire(fakeZ(belgrade(W))) === W.
 */
export function correctDoubleShiftedStoredUtc(
  storedIso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  const instant = storedUtcIsoToInstant(storedIso);
  const parts = parseBooktimeLocalComponents(storedIso);
  if (!instant || !parts) return null;

  if (booktimeIngestToStoredUtcIso(storedIso, timeZone) === storedIso) {
    return null;
  }

  const wall = formatHourMinuteInZone(instant, timeZone);
  const fakeFromBelgradeWall = buildFakeZFromComponents(parts.dateKey, wall.hour, wall.minute);
  const wireFromBelgradeWall = booktimeWireFormatToStoredUtcIso(fakeFromBelgradeWall, timeZone);
  if (!wireFromBelgradeWall || wireFromBelgradeWall !== storedIso) {
    return null;
  }

  for (const offsetHours of OFFSET_CANDIDATE_HOURS) {
    const shiftedHour = wall.hour + offsetHours;
    if (shiftedHour >= 24) continue;
    const fakeZ = buildFakeZFromComponents(parts.dateKey, shiftedHour, wall.minute);
    const candidate = booktimeWireFormatToStoredUtcIso(fakeZ, timeZone);
    if (!candidate || candidate === storedIso) continue;
    if (booktimeIngestToStoredUtcIso(candidate, timeZone) === storedIso) {
      return candidate;
    }
  }
  return null;
}

export function isDoubleShiftPattern(
  storedIso: string,
  expectedIso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): boolean {
  if (storedIso === expectedIso) return false;
  return correctDoubleShiftedStoredUtc(storedIso, timeZone) === expectedIso;
}
