import api from './axios';
import { ApiResponse, Bug, BugsResponse, BugType, BugStatus } from '@/types';
import { BUG_CREATE_REQUEST_TIMEOUT_MS } from '@/components/bugs/bugCreateTimeout';

export interface CreateBugData {
  text: string;
  bugType: BugType;
  priority?: number;
}

export interface CreateBugResponse {
  bug: Bug;
  groupChannel: { id: string };
}

export interface BugWithGroupChannel extends Bug {
  groupChannel?: { id: string };
}

export interface UpdateBugData {
  status?: BugStatus;
  bugType?: BugType;
  priority?: number;
}

export const bugsApi = {
  createBug: async (data: CreateBugData, options?: { signal?: AbortSignal }) => {
    const response = await api.post<ApiResponse<CreateBugResponse>>('/bugs', data, {
      timeout: BUG_CREATE_REQUEST_TIMEOUT_MS,
      signal: options?.signal,
    });
    return response.data;
  },

  getBugs: async (params?: {
    status?: BugStatus;
    bugType?: BugType;
    myBugsOnly?: boolean;
    page?: number;
    limit?: number;
    all?: boolean;
  }) => {
    const response = await api.get<ApiResponse<BugsResponse>>('/bugs', { params });
    return response.data;
  },

  getBugById: async (id: string) => {
    const response = await api.get<ApiResponse<BugWithGroupChannel>>(`/bugs/${id}`);
    return response.data;
  },

  updateBug: async (id: string, data: UpdateBugData) => {
    const response = await api.put<ApiResponse<Bug>>(`/bugs/${id}`, data);
    return response.data;
  },

  deleteBug: async (id: string) => {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/bugs/${id}`);
    return response.data;
  },

  joinChat: async (id: string) => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/bugs/${id}/join-chat`);
    return response.data;
  },

  leaveChat: async (id: string) => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/bugs/${id}/leave-chat`);
    return response.data;
  },
};
