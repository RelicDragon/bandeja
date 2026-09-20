import type { Game, JoinQueue } from '@/types';

/**
 * PRD 347 — the queue facts the panel, the settings row and the tests all read.
 *
 * Queue order is `joinedAt` ascending; the backend already sorts `joinQueues`
 * that way (`GameReadService.computeJoinQueuesFromParticipants`), but this
 * re-sorts defensively so an optimistic local patch cannot reorder the list.
 */
export interface QueueState {
  /** Queue entries, first in line first. */
  entries: JoinQueue[];
  total: number;
  /** 1-based position of the viewer, or `null` when they are not queued. */
  viewerPosition: number | null;
  autoFillEnabled: boolean;
  /** Seats not taken by a PLAYING participant. */
  openSeats: number;
}

export function readQueueState(
  game: Pick<Game, 'joinQueues' | 'participants' | 'maxParticipants' | 'autoFillFromQueue'>,
  viewerUserId: string | undefined,
): QueueState {
  const entries = [...(game.joinQueues ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const index = viewerUserId ? entries.findIndex((e) => e.userId === viewerUserId) : -1;
  const playing = (game.participants ?? []).filter((p) => p.status === 'PLAYING').length;

  return {
    entries,
    total: entries.length,
    viewerPosition: index === -1 ? null : index + 1,
    autoFillEnabled: game.autoFillFromQueue === true,
    openSeats: Math.max(0, (game.maxParticipants ?? 0) - playing),
  };
}
