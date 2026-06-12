import { resolveSnapshotCourtIds } from './booktimeSnapshotCourtResolve';
import type { BooktimeSnapshotCourtInput } from './booktimeBusySnapshot';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function courtInput(
  externalCourtId: string,
  externalCourtName: string | null,
  courtId: string | null = null
): BooktimeSnapshotCourtInput {
  return {
    courtId,
    externalCourtId,
    externalCourtName,
    busySlots: [],
  };
}

const kscCourts = [
  {
    id: 'cmhavpx4m000665s40gkzl67k',
    name: 'Court 1',
    externalCourtId: '0a338a7b-1bd7-4f94-bd75-a2b2651ecd60',
    integrationCourtName: 'Teren 1',
  },
  {
    id: 'cmhavpzzs000865s4o0qwfakx',
    name: 'Court 2',
    externalCourtId: 'bebbdc24-daeb-4c8d-b8ae-6a39a6826dad',
    integrationCourtName: 'Teren 2',
  },
  {
    id: 'cmhavq4yg000a65s4r1m1oy66',
    name: 'Court 3',
    externalCourtId: '4d527afd-fd35-4d3f-99bd-99eb2f488dd7',
    integrationCourtName: 'Teren 3 (Hala)',
  },
  {
    id: 'cmhseym8z004465twkqqp3tul',
    name: 'Court 4',
    externalCourtId: '35586664-364c-46f8-9a80-85b8dcc501ea',
    integrationCourtName: 'Teren 4 (Hala)',
  },
  {
    id: 'cmhseyqm1004665twmmyov4ga',
    name: 'Court 5',
    externalCourtId: '42ed9bd0-8fd1-4ba1-960f-23c1a71de00b',
    integrationCourtName: 'Teren 5 (Hala)',
  },
  {
    id: 'cmhseyw6d004865twkm291w2q',
    name: 'Court 6',
    externalCourtId: '191ec445-47ce-4d08-97a0-439a4f0ba255',
    integrationCourtName: 'Teren 6 (Hala)',
  },
  {
    id: 'cmhsez7s0004a65twempvkp1m',
    name: 'Court 7 (central)',
    externalCourtId: '5dd14650-00b4-4cae-a710-0476f368cc83',
    integrationCourtName: 'Central',
  },
];

const kscSnapshotRows = [
  courtInput('0a338a7b-1bd7-4f94-bd75-a2b2651ecd60', 'Teren 1'),
  courtInput('bebbdc24-daeb-4c8d-b8ae-6a39a6826dad', 'Teren 2'),
  courtInput('4d527afd-fd35-4d3f-99bd-99eb2f488dd7', 'Teren 3 (Hala)'),
  courtInput('35586664-364c-46f8-9a80-85b8dcc501ea', 'Teren 4 (Hala)'),
  courtInput('42ed9bd0-8fd1-4ba1-960f-23c1a71de00b', 'Teren 5 (Hala)'),
  courtInput('191ec445-47ce-4d08-97a0-439a4f0ba255', 'Teren 6 (Hala)'),
  courtInput('5dd14650-00b4-4cae-a710-0476f368cc83', 'Central'),
  courtInput('afbde548-21e9-44c3-b77b-3e7b5b798944', 'Teren 1'),
  courtInput('cac2f973-e8bd-4afa-a38a-1acfdfedf6c4', 'Betonski teren'),
];

const resolvedKsc = resolveSnapshotCourtIds(kscSnapshotRows, kscCourts);

for (let i = 0; i < 7; i += 1) {
  assert(resolvedKsc[i].courtId === kscCourts[i].id, `KSC mapped court ${i + 1} by externalCourtId`);
}

assert(resolvedKsc[7].courtId === kscCourts[0].id, 'duplicate Booktime Teren 1 maps by name');
assert(resolvedKsc[8].courtId === null, 'unmapped Betonski teren stays null');

const overwritten = resolveSnapshotCourtIds(
  [courtInput('0a338a7b-1bd7-4f94-bd75-a2b2651ecd60', 'Teren 1', 'wrong-id')],
  kscCourts
);
assert(
  overwritten[0].courtId === kscCourts[0].id,
  'externalCourtId mapping overrides wrong client courtId'
);

const clientFallback = resolveSnapshotCourtIds(
  [courtInput('00000000-0000-4000-8000-000000000099', 'Unknown', kscCourts[0].id)],
  kscCourts
);
assert(
  clientFallback[0].courtId === kscCourts[0].id,
  'client courtId kept when external/name lookup misses'
);

const nameOnly = resolveSnapshotCourtIds(
  [courtInput('00000000-0000-4000-8000-000000000099', 'Teren 3 (Hala)')],
  kscCourts
);
assert(nameOnly[0].courtId === kscCourts[2].id, 'name fallback via integrationCourtName label');

const shortBooktimeName = resolveSnapshotCourtIds(
  [courtInput('92a0a566-174a-4be3-a075-02c633ecab56', 'Teren 3')],
  kscCourts
);
assert(shortBooktimeName[0].courtId === null, 'short Booktime name without DB external id stays null');

console.log('ok: booktimeSnapshotCourtResolve.test.ts');
