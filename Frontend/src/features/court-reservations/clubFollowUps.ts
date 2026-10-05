/**
 * "Things to do at the club" — from the server (`Game.pendingClubFollowUps`,
 * NEEDS_CLUB run steps) and from this device's last run journal. One shape
 * for the card, de-duplicated by booking id / key.
 */
import type { PendingClubFollowUp } from '@/api/courtSlots';
import type { RunFollowUp, RunJournal } from './reservationRunner';

export type ClubFollowUpReason = 'cancel_old' | 'ask_club' | 'left_at_club';

export type ClubFollowUp = {
  id: string;
  reason: ClubFollowUpReason;
  provider: string | null;
  courtId: string | null;
  externalBookingId: string | null;
  start: string | null;
  end: string | null;
  /** Server journal step (dismiss = mark it DONE). */
  changeId?: string;
  idempotencyKey?: string;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function reasonFromKind(kind: string): ClubFollowUpReason {
  if (kind === 'manual_club') return 'ask_club';
  if (kind === 'book') return 'left_at_club';
  return 'cancel_old';
}

function reasonFromRun(reason: RunFollowUp['reason']): ClubFollowUpReason {
  switch (reason) {
    case 'manual_cancel':
    case 'cancel_failed':
      return 'cancel_old';
    case 'left_at_club':
      return 'left_at_club';
    case 'manual_club':
      return 'ask_club';
  }
}

/** `GET /games/:id` → `pendingClubFollowUps` (organizers only). */
export function clubFollowUpsFromPayload(list: readonly PendingClubFollowUp[] | null | undefined): ClubFollowUp[] {
  return (list ?? []).map((raw) => {
    const step = (raw.step ?? {}) as Record<string, unknown>;
    return {
      id: `${raw.changeId}:${raw.idempotencyKey}`,
      reason: reasonFromKind(raw.kind),
      provider: str(step.provider),
      courtId: str(step.courtId),
      externalBookingId: str(step.externalBookingId),
      start: str(step.start),
      end: str(step.end),
      changeId: raw.changeId,
      idempotencyKey: raw.idempotencyKey,
    };
  });
}

/**
 * `start`/`end` of a cancel follow-up is the OLD reservation's time when we
 * know it (`linkTimes`, keyed by provider booking id).
 */
export function clubFollowUpsFromRun(
  journal: RunJournal | null | undefined,
  linkTimes: Readonly<Record<string, { start?: string | null; end?: string | null; courtId?: string | null }>> = {},
): ClubFollowUp[] {
  if (!journal || journal.phase === 'running') return [];
  return journal.followUps.map((f) => {
    const old = f.externalBookingId ? linkTimes[f.externalBookingId] : undefined;
    const serverStep = journal.serverRunId && !f.key.startsWith('left:');
    return {
      id: `run:${f.key}`,
      ...(serverStep ? { changeId: journal.serverRunId as string, idempotencyKey: f.key } : {}),
      reason: reasonFromRun(f.reason),
      provider: f.provider,
      courtId: f.courtId ?? old?.courtId ?? null,
      externalBookingId: f.externalBookingId ?? null,
      start: f.start ?? old?.start ?? null,
      end: f.end ?? old?.end ?? null,
    };
  });
}

/**
 * The same follow-up can arrive from the server payload and from this device's
 * journal under different ids, so an entry is a duplicate when ANY of its
 * identities (server step, provider booking, own id) was already seen.
 */
function followUpIdentities(f: ClubFollowUp): string[] {
  const keys = [`id:${f.id}`];
  if (f.changeId && f.idempotencyKey) keys.push(`step:${f.changeId}:${f.idempotencyKey}`);
  if (f.externalBookingId) keys.push(`booking:${f.reason}:${f.externalBookingId}`);
  return keys;
}

export function mergeClubFollowUps(...lists: readonly ClubFollowUp[][]): ClubFollowUp[] {
  const seen = new Set<string>();
  const out: ClubFollowUp[] = [];
  for (const list of lists) {
    for (const f of list) {
      const keys = followUpIdentities(f);
      if (keys.some((k) => seen.has(k))) continue;
      keys.forEach((k) => seen.add(k));
      out.push(f);
    }
  }
  return out;
}
