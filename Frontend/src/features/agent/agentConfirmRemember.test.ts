import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('@/api/axios', () => ({ default: http }));

import { agentApi } from '@/api/agent';

const caps = { headers: { 'X-Agent-Client-Caps': 'booking-v1' } };

describe('agentApi.confirmAction remember payload', () => {
  beforeEach(() => {
    http.post.mockReset();
    http.post.mockResolvedValue({ data: { data: { action: { id: 'a1' }, runId: null, remembered: true } } });
  });

  it('"Allow once" posts no body', async () => {
    await agentApi.confirmAction('a1');
    expect(http.post).toHaveBeenCalledWith('/agent/actions/a1/confirm', undefined, caps);
  });

  it('"Always allow" posts {remember: "always"} and returns remembered', async () => {
    const res = await agentApi.confirmAction('a1', { remember: 'always' });
    expect(http.post).toHaveBeenCalledWith('/agent/actions/a1/confirm', { remember: 'always' }, caps);
    expect(res.remembered).toBe(true);
  });

  it('permissions endpoints unwrap the envelopes', async () => {
    const tools = [{ toolName: 'join_game' }];
    http.get.mockResolvedValue({ data: { data: { tools } } });
    http.put.mockResolvedValue({ data: { data: tools[0] } });
    http.delete.mockResolvedValue({ data: { data: { tools } } });
    await expect(agentApi.listPermissions()).resolves.toEqual(tools);
    await expect(agentApi.setPermission('join_game', 'ALWAYS_ALLOW')).resolves.toEqual(tools[0]);
    expect(http.put).toHaveBeenCalledWith('/agent/permissions/join_game', { mode: 'ALWAYS_ALLOW' }, caps);
    await expect(agentApi.resetPermissions()).resolves.toEqual(tools);
    expect(http.delete).toHaveBeenCalledWith('/agent/permissions', caps);
  });
});
