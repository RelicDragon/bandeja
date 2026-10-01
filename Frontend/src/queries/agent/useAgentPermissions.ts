import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { AgentToolPermissionDto, AgentToolPermissionMode } from '@shared/agentContract';
import { agentApi } from '@/api/agent';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';

/** Tabs of the "Assistant settings" dialog (plan §15 permissions, Phase 11 memory). */
export type AgentSettingsTab = 'permissions' | 'memory';

/**
 * "Assistant settings" (plan §15 + Phase 11): opened from the AI ⋯ menus, the auto-approved
 * card (Permissions) and the "Saved to memory" chip (Memory).
 */
export const useAgentPermissionsScreenStore = create<{
  open: boolean;
  tab: AgentSettingsTab;
  setOpen: (open: boolean) => void;
  setTab: (tab: AgentSettingsTab) => void;
}>((set) => ({
  open: false,
  tab: 'permissions',
  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab }),
}));

/** Opens the dialog on `initialTab` (default Permissions). Call it as `() => openAgentPermissionsScreen()`. */
export function openAgentPermissionsScreen(initialTab: AgentSettingsTab = 'permissions'): void {
  useAgentPermissionsScreenStore.setState({ open: true, tab: initialTab === 'memory' ? 'memory' : 'permissions' });
}

/** Every write tool the user has, with its mode (no row = ASK). */
export function useAgentPermissionsQuery(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<AgentToolPermissionDto[]>({
    queryKey: queryKeys.agent.permissions(userId ?? 'anon'),
    queryFn: () => agentApi.listPermissions(),
    enabled: enabled && Boolean(userId),
    staleTime: 30_000,
  });
}

export function patchPermissionMode(
  list: AgentToolPermissionDto[] | undefined,
  toolName: string,
  mode: AgentToolPermissionMode,
): AgentToolPermissionDto[] | undefined {
  return list?.map((tool) => (tool.toolName === toolName ? { ...tool, mode } : tool));
}

/** Ask ↔ Always allow, optimistic: the switch flips at once and rolls back when the server says no. */
export function useSetAgentPermissionMutation() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const key = queryKeys.agent.permissions(userId ?? 'anon');
  return useMutation({
    mutationFn: ({ toolName, mode }: { toolName: string; mode: AgentToolPermissionMode }) =>
      agentApi.setPermission(toolName, mode),
    onMutate: async ({ toolName, mode }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AgentToolPermissionDto[]>(key);
      queryClient.setQueryData<AgentToolPermissionDto[] | undefined>(key, (prev) =>
        patchPermissionMode(prev, toolName, mode),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (tool) => {
      queryClient.setQueryData<AgentToolPermissionDto[] | undefined>(key, (prev) =>
        prev?.map((t) => (t.toolName === tool.toolName ? tool : t)),
      );
    },
  });
}

export function useResetAgentPermissionsMutation() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: () => agentApi.resetPermissions(),
    onSuccess: (tools) => {
      queryClient.setQueryData(queryKeys.agent.permissions(userId ?? 'anon'), tools);
    },
  });
}

/** After "Always allow" on a card: the stored mode changed server-side. */
export function invalidateAgentPermissions(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.agent.permissions() });
}
