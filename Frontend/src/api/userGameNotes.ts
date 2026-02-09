import api from './axios';

export interface UserGameNote {
  id: string;
  userId: string;
  gameId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const userGameNotesApi = {
  getNote: (gameId: string) =>
    api.get<{ data: UserGameNote | null }>(`/user-game-notes/${gameId}`),

  createNote: (gameId: string, content: string) =>
    api.post<{ data: UserGameNote }>(`/user-game-notes/${gameId}`, { content }),

  updateNote: (gameId: string, content: string) =>
    api.put<{ data: UserGameNote }>(`/user-game-notes/${gameId}`, { content }),

  upsertNote: (gameId: string, content: string) =>
    api.patch<{ data: UserGameNote }>(`/user-game-notes/${gameId}`, { content }),

  deleteNote: (gameId: string) =>
    api.delete<{ message: string }>(`/user-game-notes/${gameId}`),
};
