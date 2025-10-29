import api from './axios';
import { ApiResponse, Bug, BugsResponse, BugType, BugStatus } from '@/types';

export interface CreateBugData {
  text: string;
  bugType: BugType;
}

export interface UpdateBugData {
  status: BugStatus;
}

export const bugsApi = {
  createBug: async (data: CreateBugData) => {
    const response = await api.post<ApiResponse<Bug>>('/bugs', data);
    return response.data;
  },

  getBugs: async (params?: {
    status?: BugStatus;
    bugType?: BugType;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get<ApiResponse<BugsResponse>>('/bugs', { params });
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
};
