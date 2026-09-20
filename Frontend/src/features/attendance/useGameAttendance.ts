/**
 * PRD 346 — data layer for the attendance card, roster dots and organizer strip.
 *
 * Answers are optimistic: an offline or flaky tap shows the pending outline
 * state and rolls back on failure, never blocking. Nothing here can change a
 * seat — the backend refuses, and the optimistic patch only ever writes the
 * viewer's own `attendance`.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceApi, type AttendanceAnswer, type GameAttendanceDetails } from '@/api/attendance';
import { queryKeys } from '@/queries/queryKeys';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import type { ParticipantAttendance } from '@/types/gameCardEnrichment';
import { patchViewerAnswer } from './attendancePatch';

export interface UseGameAttendanceOptions {
  gameId: string | undefined;
  /** The signed-in viewer, used for the optimistic patch of their own row. */
  viewerUserId: string | undefined;
  /** Skip every request when the game cannot have attendance at all. */
  enabled: boolean;
}

export interface UseGameAttendanceResult {
  details: GameAttendanceDetails | undefined;
  isLoading: boolean;
  /** The viewer's own answer, or `null` when they are not a PLAYING player. */
  viewerAttendance: ParticipantAttendance | null;
  /** `true` while an answer is in flight — drives the pending outline state. */
  isAnswering: boolean;
  isNudging: boolean;
  answer: (state: AttendanceAnswer) => Promise<void>;
  nudge: () => Promise<{ nudgedUserIds: string[] }>;
  noteNoShow: (userId: string) => Promise<void>;
  undoNoShow: (userId: string) => Promise<void>;
  attendanceOf: (userId: string) => ParticipantAttendance;
  noShowNotedAt: (userId: string) => string | null;
}

export function useGameAttendance({
  gameId,
  viewerUserId,
  enabled,
}: UseGameAttendanceOptions): UseGameAttendanceResult {
  const queryClient = useQueryClient();
  const lastAttendanceUpdate = useSocketEventsStore((state) => state.lastGameAttendanceUpdated);

  const queryKey = useMemo(
    () => queryKeys.attendance.game(gameId ?? 'none'),
    [gameId],
  );

  const query = useQuery({
    queryKey,
    queryFn: () => attendanceApi.get(gameId as string),
    enabled: Boolean(gameId) && enabled,
    staleTime: 30_000,
  });

  // Live fan-out. Any player's answer repaints the strip and the dots.
  useEffect(() => {
    if (!gameId || !enabled) return;
    if (!lastAttendanceUpdate || lastAttendanceUpdate.gameId !== gameId) return;
    queryClient.setQueryData<GameAttendanceDetails>(queryKey, (current) => {
      if (!current) return current;
      const participants = current.participants.map((row) =>
        row.userId === lastAttendanceUpdate.userId
          ? { ...row, attendance: lastAttendanceUpdate.attendance }
          : row,
      );
      return {
        ...current,
        participants,
        confirmedCount: lastAttendanceUpdate.confirmedCount,
        playingCount: lastAttendanceUpdate.playingCount,
        entries: participants.map((row) => ({ userId: row.userId, attendance: row.attendance })),
      };
    });
    void queryClient.invalidateQueries({ queryKey, exact: true });
  }, [lastAttendanceUpdate, gameId, enabled, queryClient, queryKey]);

  const answerMutation = useMutation({
    mutationFn: ({ state }: { state: AttendanceAnswer; userId: string }) =>
      attendanceApi.answer(gameId as string, state),
    onMutate: async ({ state, userId }) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previous = queryClient.getQueryData<GameAttendanceDetails>(queryKey);
      queryClient.setQueryData<GameAttendanceDetails>(queryKey, (current) =>
        current ? patchViewerAnswer(current, userId, state) : current,
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
    },
  });

  const nudgeMutation = useMutation({
    mutationFn: () => attendanceApi.nudge(gameId as string),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });

  const noteMutation = useMutation({
    mutationFn: (userId: string) => attendanceApi.noteNoShow(gameId as string, userId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });

  const undoMutation = useMutation({
    mutationFn: (userId: string) => attendanceApi.undoNoShow(gameId as string, userId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });

  const details = query.data;

  const attendanceOf = useCallback(
    (userId: string): ParticipantAttendance =>
      details?.participants.find((row) => row.userId === userId)?.attendance ?? 'UNANSWERED',
    [details],
  );

  const noShowNotedAt = useCallback(
    (userId: string): string | null =>
      details?.participants.find((row) => row.userId === userId)?.noShowNotedAt ?? null,
    [details],
  );

  const answer = useCallback(
    async (state: AttendanceAnswer) => {
      if (!gameId || !viewerUserId) return;
      await answerMutation.mutateAsync({ state, userId: viewerUserId });
    },
    [answerMutation, gameId, viewerUserId],
  );

  const nudge = useCallback(async () => {
    if (!gameId) return { nudgedUserIds: [] };
    return nudgeMutation.mutateAsync();
  }, [nudgeMutation, gameId]);

  const noteNoShow = useCallback(
    async (userId: string) => {
      if (!gameId) return;
      await noteMutation.mutateAsync(userId);
    },
    [noteMutation, gameId],
  );

  const undoNoShow = useCallback(
    async (userId: string) => {
      if (!gameId) return;
      await undoMutation.mutateAsync(userId);
    },
    [undoMutation, gameId],
  );

  return {
    details,
    isLoading: query.isLoading,
    viewerAttendance: details?.viewerAttendance ?? null,
    isAnswering: answerMutation.isPending,
    isNudging: nudgeMutation.isPending,
    answer,
    nudge,
    noteNoShow,
    undoNoShow,
    attendanceOf,
    noShowNotedAt,
  };
}
