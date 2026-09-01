import { resolveAdDisclosureLabel } from './ad.disclosure.util';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  resolveAdDisclosureLabel('BANDEJA | MONTENEGRO | PADEL | CAMP', {
    disclosureLabel: 'BANDEJA | ЧЕРНОГОРИЯ | ПАДЕЛ | КЭМП',
  }) === 'BANDEJA | ЧЕРНОГОРИЯ | ПАДЕЛ | КЭМП',
  'creative label overrides campaign fallback',
);
assert(
  resolveAdDisclosureLabel('BANDEJA | MONTENEGRO | PADEL | CAMP', null) ===
    'BANDEJA | MONTENEGRO | PADEL | CAMP',
  'campaign label remains the fallback',
);
assert(
  resolveAdDisclosureLabel('Fallback', { disclosureLabel: '   ' }) === 'Fallback',
  'blank creative labels use the fallback',
);

console.log('ad.disclosure.util: ok');
