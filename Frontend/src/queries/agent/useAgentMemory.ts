import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AgentMemoryDto, AgentMemoryOverviewDto, AgentMemoryRestore } from '@shared/agentContract';
import { agentApi } from '@/api/agent';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';

/**
 * Assistant memory (Phase 11): the Memory tab of
 * "Assistant settings" and the "Saved to memory · Undo" chip. The switch and deletes are
 * optimistic with rollback; the query only runs while the dialog is open.
 */

function useMemoryKey() {
  const userId = useAuthStore((s) => s.user?.id);
  return queryKeys.agent.memory(userId ?? 'anon');
}

export function useAgentMemoryQuery(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<AgentMemoryOverviewDto>({
    queryKey: queryKeys.agent.memory(userId ?? 'anon'),
    queryFn: () => agentApi.getMemory(),
    enabled: enabled && Boolean(userId),
    staleTime: 30_000,
  });
}

export function withoutMemoryItem(
  overview: AgentMemoryOverviewDto | undefined,
  id: string,
): AgentMemoryOverviewDto | undefined {
  return overview ? { ...overview, items: overview.items.filter((item) => item.id !== id) } : overview;
}

export function withMemoryItem(
  overview: AgentMemoryOverviewDto | undefined,
  item: AgentMemoryDto,
): AgentMemoryOverviewDto | undefined {
  if (!overview) return overview;
  const exists = overview.items.some((i) => i.id === item.id);
  return {
    ...overview,
    items: exists ? overview.items.map((i) => (i.id === item.id ? item : i)) : [item, ...overview.items],
  };
}

/** The fields an Undo needs to put a deleted item back as it was. */
export function memoryRestoreOf(item: AgentMemoryDto): { text: string; restore: AgentMemoryRestore } {
  return {
    text: item.body,
    restore: { name: item.name, description: item.description, type: item.type, source: item.source },
  };
}

/** Allow memory: flips at once, rolls back when the server says no. */
export function useSetAgentMemoryEnabledMutation() {
  const queryClient = useQueryClient();
  const key = useMemoryKey();
  return useMutation({
    mutationFn: (enabled: boolean) => agentApi.setMemoryEnabled(enabled),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AgentMemoryOverviewDto>(key);
      queryClient.setQueryData<AgentMemoryOverviewDto | undefined>(key, (prev) => (prev ? { ...prev, enabled } : prev));
      return { previous };
    },
    onError: (_err, _vars, context) => queryClient.setQueryData(key, context?.previous),
    onSuccess: (overview) => queryClient.setQueryData(key, overview),
  });
}

export function useAddAgentMemoryMutation() {
  const queryClient = useQueryClient();
  const key = useMemoryKey();
  return useMutation({
    mutationFn: ({ text, restore }: { text: string; restore?: AgentMemoryRestore }) => agentApi.addMemory(text, restore),
    onSuccess: (item) =>
      queryClient.setQueryData<AgentMemoryOverviewDto | undefined>(key, (prev) => withMemoryItem(prev, item)),
  });
}

export function useUpdateAgentMemoryMutation() {
  const queryClient = useQueryClient();
  const key = useMemoryKey();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => agentApi.updateMemory(id, text),
    onSuccess: (item) =>
      queryClient.setQueryData<AgentMemoryOverviewDto | undefined>(key, (prev) => withMemoryItem(prev, item)),
  });
}

/** Immediate delete (optimistic, rolled back on error). The caller offers Undo with `memoryRestoreOf`. */
export function useDeleteAgentMemoryMutation() {
  const queryClient = useQueryClient();
  const key = useMemoryKey();
  return useMutation({
    mutationFn: (id: string) => agentApi.deleteMemory(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AgentMemoryOverviewDto>(key);
      queryClient.setQueryData<AgentMemoryOverviewDto | undefined>(key, (prev) => withoutMemoryItem(prev, id));
      return { previous };
    },
    onError: (_err, _id, context) => queryClient.setQueryData(key, context?.previous),
  });
}

export function useClearAgentMemoryMutation() {
  const queryClient = useQueryClient();
  const key = useMemoryKey();
  return useMutation({
    mutationFn: () => agentApi.clearMemory(),
    onSuccess: () =>
      queryClient.setQueryData<AgentMemoryOverviewDto | undefined>(key, (prev) => (prev ? { ...prev, items: [] } : prev)),
  });
}

/** After a chip Undo (or any change outside the tab): refetch when the tab opens next. */
export function invalidateAgentMemory(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.agent.memory() });
}
