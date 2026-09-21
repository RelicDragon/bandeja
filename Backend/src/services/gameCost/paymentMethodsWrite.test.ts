import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  paymentMethodColumns,
  parsePaymentMethodsOrThrow,
  resolvePaymentMethodWrite,
  shouldPrefillPayoutMethods,
} from './paymentMethodsWrite';
import { ApiError } from '../../utils/ApiError';

/**
 * PRD 348 — the columns a payment-method write produces.
 *
 * The one rule worth a test: `Game.paymentHint` is a *mirror*, never an
 * independent field. An app build shipped before the catalogue reads only the
 * mirror, so a write that updated `paymentMethods` and left `paymentHint`
 * stale would show those phones a payment handle the organiser had already
 * replaced.
 */

function expectApiError(fn: () => unknown, message: string): void {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ApiError, 'expected an ApiError');
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, message);
    return;
  }
  assert.fail(`expected a 400 ${message}`);
}

function run() {
  // 1. the mirror always summarises the list it was written with.
  const columns = paymentMethodColumns([
    { method: 'IPS_PRENESI', handle: '+381601112233' },
    { method: 'CASH', handle: null },
  ]);
  assert.equal(columns.paymentHint, 'IPS Prenesi +381601112233 · Cash');
  assert.deepEqual(columns.paymentMethods, [
    { method: 'IPS_PRENESI', handle: '+381601112233' },
    { method: 'CASH', handle: null },
  ]);

  // 2. clearing clears both — never a mirror left behind.
  const cleared = paymentMethodColumns([]);
  assert.equal(cleared.paymentHint, null);
  assert.equal(cleared.paymentMethods, Prisma.DbNull);

  // 3. the structured list wins over a legacy hint sent in the same body.
  const both = resolvePaymentMethodWrite({
    paymentMethods: [{ method: 'BIZUM', handle: '+34600112233' }],
    paymentHint: 'ignore me',
  });
  assert.equal(both?.paymentHint, 'Bizum +34600112233');

  // 4. a pre-catalogue client sending only free text still works.
  const legacy = resolvePaymentMethodWrite({ paymentHint: '  cash at the bar  ' });
  assert.deepEqual(legacy?.paymentMethods, [{ method: 'CUSTOM', handle: 'cash at the bar' }]);
  assert.equal(legacy?.paymentHint, 'cash at the bar');

  // 5. neither key means "leave the columns alone".
  assert.equal(resolvePaymentMethodWrite({}), undefined);

  // 6. an explicit null on either key clears.
  assert.equal(resolvePaymentMethodWrite({ paymentMethods: null })?.paymentHint, null);
  assert.equal(resolvePaymentMethodWrite({ paymentHint: null })?.paymentHint, null);
  assert.equal(resolvePaymentMethodWrite({ paymentHint: '   ' })?.paymentHint, null);

  // 7. the catalogue is the validator, and it answers 400 by issue code.
  expectApiError(
    () => parsePaymentMethodsOrThrow([{ method: 'NOT_A_METHOD', handle: 'x' }]),
    'errors.cost.paymentMethod.unknownMethod',
  );
  expectApiError(
    () => parsePaymentMethodsOrThrow([{ method: 'BIZUM', handle: '' }]),
    'errors.cost.paymentMethod.handleRequired',
  );
  expectApiError(
    () => parsePaymentMethodsOrThrow([{ method: 'IBAN', handle: 'nope' }]),
    'errors.cost.paymentMethod.handleInvalid',
  );
  expectApiError(
    () =>
      parsePaymentMethodsOrThrow([
        { method: 'CASH' },
        { method: 'BIZUM', handle: '+34600112233' },
        { method: 'IBAN', handle: 'ES9121000418450200051332' },
        { method: 'REVOLUT', handle: '@x' },
      ]),
    'errors.cost.paymentMethod.tooMany',
  );

  // 8. a legacy hint that no longer fits is rejected, not truncated — the same
  //    answer the free-text field gave before the catalogue existed.
  expectApiError(
    () => resolvePaymentMethodWrite({ paymentHint: 'x'.repeat(121) }),
    'errors.cost.paymentMethod.handleTooLong',
  );

  // 9. the prefill from the organiser's profile is scoped to games that can
  //    actually have a cost split.
  assert.equal(shouldPrefillPayoutMethods({ entityType: 'GAME', priceType: 'TOTAL' }), true);
  assert.equal(shouldPrefillPayoutMethods({ entityType: 'GAME', priceType: 'PER_PERSON' }), true);
  assert.equal(shouldPrefillPayoutMethods({ entityType: 'TRAINING', priceType: 'TOTAL' }), true);
  // A public listing whose price is a ticket bought elsewhere must never carry
  // the organiser's personal bank details to its whole roster.
  assert.equal(shouldPrefillPayoutMethods({ entityType: 'EVENT', priceType: 'TOTAL' }), false);
  // Nothing to settle, nothing to prefill.
  assert.equal(shouldPrefillPayoutMethods({ entityType: 'GAME', priceType: 'FREE' }), false);
  assert.equal(shouldPrefillPayoutMethods({ entityType: 'GAME', priceType: 'NOT_KNOWN' }), false);
  assert.equal(shouldPrefillPayoutMethods({ entityType: 'GAME', priceType: null }), false);
  // PER_TEAM yields no game total, so it shows no cost card either.
  assert.equal(shouldPrefillPayoutMethods({ entityType: 'GAME', priceType: 'PER_TEAM' }), false);

  console.log('paymentMethodsWrite.test.ts: ok');
}

run();
