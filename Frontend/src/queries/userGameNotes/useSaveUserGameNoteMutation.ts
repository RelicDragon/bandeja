import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { userGameNotesApi } from '@/api/userGameNotes';
import { queryKeys } from '../queryKeys';

export function useSaveUserGameNoteMutation(gameId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (rawContent: string) => {
      const trimmed = rawContent.trim();
      if (!trimmed) {
        try {
          await userGameNotesApi.deleteNote(gameId);
        } catch (error) {
          if (!isAxiosError(error) || error.response?.status !== 404) throw error;
        }
        return null;
      }
      const response = await userGameNotesApi.upsertNote(gameId, trimmed);
      return response.data.data;
    },
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.userGameNotes.detail(gameId), note);
      void queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    },
    onError: (error) => {
      console.error('Failed to save user game note:', error);
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    },
  });
}
