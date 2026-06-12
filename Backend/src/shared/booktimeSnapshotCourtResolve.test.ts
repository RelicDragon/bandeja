import {
  buildSnapshotCourtLookupByExternalId,
  mergeSnapshotCourtsForStorage,
  prepareSnapshotCourtsForStorage,
  resolveSnapshotCourtIds,
} from './booktimeSnapshotCourtResolve';
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

const KSC_PROD_DB_COURTS = [
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
] as const;

const KSC_BOOKTIME_AVAILABLE_SLOTS = [
  { uuid: '0a338a7b-1bd7-4f94-bd75-a2b2651ecd60', name: 'Teren 1' },
  { uuid: 'bebbdc24-daeb-4c8d-b8ae-6a39a6826dad', name: 'Teren 2' },
  { uuid: '4d527afd-fd35-4d3f-99bd-99eb2f488dd7', name: 'Teren 3 (Hala)' },
  { uuid: '35586664-364c-46f8-9a80-85b8dcc501ea', name: 'Teren 4 (Hala)' },
  { uuid: '42ed9bd0-8fd1-4ba1-960f-23c1a71de00b', name: 'Teren 5 (Hala)' },
  { uuid: '191ec445-47ce-4d08-97a0-439a4f0ba255', name: 'Teren 6 (Hala)' },
  { uuid: '5dd14650-00b4-4cae-a710-0476f368cc83', name: 'Central' },
  { uuid: 'afbde548-21e9-44c3-b77b-3e7b5b798944', name: 'Teren 1' },
  { uuid: '35c33945-c42f-419d-adc7-dae3886faeff', name: 'Teren 2' },
] as const;

const kscSnapshotRows = KSC_BOOKTIME_AVAILABLE_SLOTS.map((row) =>
  courtInput(row.uuid, row.name)
);

for (const dbCourt of KSC_PROD_DB_COURTS) {
  const booktimeRow = KSC_BOOKTIME_AVAILABLE_SLOTS.find((row) => row.uuid === dbCourt.externalCourtId);
  assert(booktimeRow != null, `prod externalCourtId ${dbCourt.externalCourtId} exists in Booktime response`);
  if (!booktimeRow) continue;
  assert(
    booktimeRow.name === dbCourt.integrationCourtName,
    `prod integrationCourtName matches Booktime label for ${dbCourt.externalCourtId}`
  );
}

const byExternal = buildSnapshotCourtLookupByExternalId([...KSC_PROD_DB_COURTS]);
assert(byExternal.size === 7, 'prod KSC has seven mapped externalCourtId values');

const resolvedKsc = resolveSnapshotCourtIds(kscSnapshotRows, [...KSC_PROD_DB_COURTS]);

for (let i = 0; i < 7; i += 1) {
  assert(
    resolvedKsc[i].courtId === KSC_PROD_DB_COURTS[i].id,
    `padel group row ${i} maps by externalCourtId only`
  );
}

assert(
  resolvedKsc[7].courtId === null,
  'other sport group Teren 1 stays unmapped despite identical name'
);
assert(
  resolvedKsc[8].courtId === null,
  'other sport group Teren 2 stays unmapped despite identical name'
);

const overwritten = resolveSnapshotCourtIds(
  [courtInput('0a338a7b-1bd7-4f94-bd75-a2b2651ecd60', 'Teren 1', 'wrong-id')],
  [...KSC_PROD_DB_COURTS]
);
assert(
  overwritten[0].courtId === KSC_PROD_DB_COURTS[0].id,
  'known externalCourtId overrides wrong client courtId'
);

const unknownExternal = resolveSnapshotCourtIds(
  [courtInput('00000000-0000-4000-8000-000000000099', 'Teren 3 (Hala)', KSC_PROD_DB_COURTS[2].id)],
  [...KSC_PROD_DB_COURTS]
);
assert(
  unknownExternal[0].courtId === null,
  'unknown externalCourtId clears client courtId instead of name fallback'
);

const mergedKsc = prepareSnapshotCourtsForStorage(kscSnapshotRows, [...KSC_PROD_DB_COURTS]);
assert(mergedKsc.length === 9, 'each external uuid keeps its own snapshot row');
assert(
  mergedKsc.filter((row) => row.courtId != null).length === 7,
  'only padel group externals map to internal courts'
);
assert(
  mergedKsc.filter((row) => row.courtId === null).length === 2,
  'other sport group externals remain unmapped rows'
);

const mergedBusy = mergeSnapshotCourtsForStorage(
  [
    {
      ...courtInput(KSC_PROD_DB_COURTS[0].externalCourtId, 'Teren 1', KSC_PROD_DB_COURTS[0].id),
      busySlots: [{ startTime: '2026-06-12T10:00:00.000Z', endTime: '2026-06-12T11:00:00.000Z' }],
    },
    {
      ...courtInput(KSC_PROD_DB_COURTS[0].externalCourtId, 'Teren 1', KSC_PROD_DB_COURTS[0].id),
      busySlots: [
        { startTime: '2026-06-12T10:00:00.000Z', endTime: '2026-06-12T11:00:00.000Z' },
        { startTime: '2026-06-12T12:00:00.000Z', endTime: '2026-06-12T13:00:00.000Z' },
      ],
    },
  ],
  [...KSC_PROD_DB_COURTS]
);
assert(mergedBusy.length === 1, 'duplicate rows for same mapped courtId merge');
assert(mergedBusy[0]?.busySlots.length === 2, 'merged busy slots dedupe identical intervals');

console.log('ok: booktimeSnapshotCourtResolve.test.ts');
