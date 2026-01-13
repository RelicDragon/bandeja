import api from './axios';
import { ApiResponse, Bug, BugsResponse, BugType, BugStatus } from '@/types';

export interface CreateBugData {
  text: string;
  bugType: BugType;
}

export interface UpdateBugData {
  status?: BugStatus;
  bugType?: BugType;
}

export const bugsApi = {
  createBug: async (data: CreateBugData) => {
    const response = await api.post<ApiResponse<Bug>>('/bugs', data);
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
    const response = await api.get<ApiResponse<Bug>>(`/bugs/${id}`);
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
