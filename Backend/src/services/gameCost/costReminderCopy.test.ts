import assert from 'node:assert/strict';

/**
 * House style for backend tests is `ts-node` + `node:assert` — there is no
 * vitest in the backend. Thin shims keep the original spec readable.
 */
function describe(_name: string, body: () => void): void {
  body();
}
function it(name: string, body: () => void): void {
  try {
    body();
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toContain: (needle: string) =>
      assert.ok(String(actual).includes(needle), `expected ${String(actual)} to contain ${needle}`),
    toBeGreaterThan: (n: number) => assert.ok(Number(actual) > n),
    toBeTruthy: () => assert.ok(actual),
    toBeNull: () => assert.equal(actual, null),
    not: {
      toContain: (needle: string) =>
        assert.ok(
          !String(actual).includes(needle),
          `expected ${String(actual)} not to contain ${needle}`,
        ),
      toBe: (expected: unknown) => assert.notEqual(actual, expected),
    },
  };
}

import { buildCostReminderCopy } from './costReminderCopy';

describe('buildCostReminderCopy', () => {
  it('interpolates the payer and game names', () => {
    const copy = buildCostReminderCopy({
      language: 'en',
      amountMinor: 1000,
      currency: 'EUR',
      payerName: 'Ilya',
      gameName: 'Tuesday Regulars',
    });
    expect(copy.body).toContain('Ilya');
    expect(copy.body).toContain('Tuesday Regulars');
    expect(copy.body).not.toContain('{{');
  });

  it('treats `$`-sequences in user-supplied names literally', () => {
    // `String.prototype.replace` with a string replacement expands `$&`, `$'`,
    // `` $` `` and `$$`; these names are user-controlled.
    for (const name of ['$&', "$'", '$`', '$$', '$1']) {
      const copy = buildCostReminderCopy({
        language: 'en',
        amountMinor: 1000,
        currency: 'EUR',
        payerName: name,
        gameName: 'Padel',
      });
      expect(copy.body).toContain(name);
      expect(copy.body).not.toContain('{{name}}');
      expect(copy.body).not.toContain('{{game}}');
      expect(copy.body).not.toContain('{{amount}}');
    }
  });
});

console.log('PASS ' + __filename.split('/').pop());
