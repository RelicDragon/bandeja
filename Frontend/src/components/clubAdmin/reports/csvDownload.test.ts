import { describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { normalizeBlobError } from '@/api/clubAdminBilling';
import { parseClubAdminError } from '@/api/clubAdminErrors';
import { deliverCsv, reportCsvFileName, type CsvDeliveryDeps } from './csvDownload';

vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: {} }));
vi.mock('@capacitor/share', () => ({ Share: {} }));

function deps(native: boolean, shareImpl?: () => Promise<void>): CsvDeliveryDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    native,
    shareNative: vi.fn(async (_b: Blob, name: string) => {
      calls.push(`share:${name}`);
      if (shareImpl) await shareImpl();
    }),
    download: vi.fn((_b: Blob, name: string) => {
      calls.push(`download:${name}`);
    }),
  };
}

describe('reportCsvFileName', () => {
  it('slugs the club name and carries dataset and range', () => {
    expect(reportCsvFileName('Padel Klub Čukarica!', 'payments', '2026-09-01', '2026-09-30')).toBe(
      'bandeja-padel-klub-cukarica-payments-2026-09-01_2026-09-30.csv'
    );
    expect(reportCsvFileName('***', 'players', '2026-01-01', '2026-01-07')).toBe('bandeja-club-players-2026-01-01_2026-01-07.csv');
  });
});

describe('deliverCsv', () => {
  const blob = new Blob(['﻿a,b\r\n1,2\r\n'], { type: 'text/csv' });

  it('downloads on the web', async () => {
    const d = deps(false);
    await expect(deliverCsv(blob, 'x.csv', d)).resolves.toBe('downloaded');
    expect(d.calls).toEqual(['download:x.csv']);
  });

  it('shares through the native sheet on Capacitor', async () => {
    const d = deps(true);
    await expect(deliverCsv(blob, 'x.csv', d)).resolves.toBe('shared');
    expect(d.calls).toEqual(['share:x.csv']);
  });

  it('treats a dismissed share sheet as no error, and rethrows real failures', async () => {
    await expect(deliverCsv(blob, 'x.csv', deps(true, () => Promise.reject(new Error('Share canceled'))))).resolves.toBe('dismissed');
    await expect(deliverCsv(blob, 'x.csv', deps(true, () => Promise.reject(new Error('disk full'))))).rejects.toThrow('disk full');
  });

  it('labels an untyped blob as CSV', async () => {
    const d = deps(false);
    await deliverCsv(new Blob(['a']), 'x.csv', d);
    const passed = (d.download as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(passed.type).toContain('text/csv');
  });
});

describe('normalizeBlobError', () => {
  it('turns a JSON error blob back into a parsable club admin error', async () => {
    const body = new Blob([JSON.stringify({ success: false, code: 'clubAdmin.rangeTooLarge', message: 'x' })], {
      type: 'application/json',
    });
    const err = new AxiosError('bad', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      data: body,
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    const out = await normalizeBlobError(err);
    expect(parseClubAdminError(out).suffix).toBe('rangeTooLarge');
  });
});
