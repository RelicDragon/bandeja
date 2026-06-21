import { queryOptions, useQuery } from '@tanstack/react-query';
import { userGameNotesApi, type UserGameNote } from '@/api/userGameNotes';
import { queryKeys } from '../queryKeys';

const USER_GAME_NOTE_STALE_TIME = 5 * 60 * 1000;

export function userGameNoteQueryOptions(gameId: string, seedContent?: string | null) {
  return queryOptions({
    queryKey: queryKeys.userGameNotes.detail(gameId),
    queryFn: async (): Promise<UserGameNote | null> => {
      const response = await userGameNotesApi.getNote(gameId);
      return response.data.data;
    },
    staleTime: USER_GAME_NOTE_STALE_TIME,
    placeholderData:
      seedContent !== undefined
        ? seedContent
          ? ({
              id: '',
              userId: '',
              gameId,
              content: seedContent,
              createdAt: '',
              updatedAt: '',
            } satisfies UserGameNote)
          : null
        : undefined,
  });
}

export function useUserGameNoteQuery(gameId: string, seedContent?: string | null) {
  return useQuery(userGameNoteQueryOptions(gameId, seedContent));
}
