import { describe, expect, it, beforeEach, vi } from 'vitest';

describe('trophyCelebrationGate', () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    const listeners = new Map<string, Set<EventListener>>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    vi.stubGlobal('window', {
      addEventListener: (type: string, handler: EventListener) => {
        const set = listeners.get(type) ?? new Set();
        set.add(handler);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, handler: EventListener) => {
        listeners.get(type)?.delete(handler);
      },
      dispatchEvent: (event: Event) => {
        for (const handler of listeners.get(event.type) ?? []) {
          handler(event);
        }
        return true;
      },
    });
  });

  it('soft-claims once and persists on mark', async () => {
    const gate = await import('./trophyCelebrationGate');
    const id = 'ach-1';
    expect(gate.wasCelebrationShown(id)).toBe(false);
    expect(gate.claimCelebration(id)).toBe(true);
    expect(gate.claimCelebration(id)).toBe(false);
    expect(gate.wasCelebrationShown(id)).toBe(true);
    expect(gate.isCelebrationPersisted(id)).toBe(false);

    gate.releaseCelebrationClaim(id);
    expect(gate.wasCelebrationShown(id)).toBe(false);
    expect(gate.claimCelebration(id)).toBe(true);

    gate.markCelebrationShown(id);
    expect(gate.isCelebrationPersisted(id)).toBe(true);
    expect(gate.claimCelebration(id)).toBe(false);
  });

  it('allows only one active celebration session', async () => {
    const gate = await import('./trophyCelebrationGate');
    expect(gate.claimCelebration('a')).toBe(true);
    expect(gate.claimCelebration('b')).toBe(false);
    gate.releaseCelebrationClaim('a');
    expect(gate.claimCelebration('b')).toBe(true);
  });

  it('mark frees session so another unlock can claim', async () => {
    const gate = await import('./trophyCelebrationGate');
    const seen: string[] = [];
    const handler = (e: Event) => {
      seen.push((e as CustomEvent<{ achievementId: string }>).detail.achievementId);
    };
    window.addEventListener(gate.TROPHY_CELEBRATION_RELEASED, handler);
    expect(gate.claimCelebration('a')).toBe(true);
    gate.markCelebrationShown('a');
    expect(gate.claimCelebration('b')).toBe(true);
    expect(seen).toContain('a');
    window.removeEventListener(gate.TROPHY_CELEBRATION_RELEASED, handler);
  });
});
