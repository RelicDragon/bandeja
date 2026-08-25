import assert from 'node:assert/strict';
import { rankNearbyCities, type NearbyCityCandidate } from './nearbyCities';

const prague: NearbyCityCandidate = {
  id: 'prague',
  name: 'Prague',
  country: 'CZ',
  administrativeArea: 'Prague',
  subAdministrativeArea: null,
  latitude: 50.0755,
  longitude: 14.4378,
};

const kladno: NearbyCityCandidate = {
  id: 'kladno',
  name: 'Kladno',
  country: 'CZ',
  administrativeArea: 'Central Bohemia',
  subAdministrativeArea: null,
  latitude: 50.1473,
  longitude: 14.1028,
};

const brno: NearbyCityCandidate = {
  id: 'brno',
  name: 'Brno',
  country: 'CZ',
  administrativeArea: 'South Moravia',
  subAdministrativeArea: null,
  latitude: 49.1951,
  longitude: 16.6068,
};

const barcelona: NearbyCityCandidate = {
  id: 'barcelona',
  name: 'Barcelona',
  country: 'ES',
  administrativeArea: 'Catalonia',
  subAdministrativeArea: 'Barcelonès',
  latitude: 41.3874,
  longitude: 2.1686,
};

const santCugat: NearbyCityCandidate = {
  id: 'sant-cugat',
  name: 'Sant Cugat',
  country: 'ES',
  administrativeArea: 'Catalonia',
  subAdministrativeArea: 'Vallès Occidental',
  latitude: 41.4726,
  longitude: 2.0865,
};

{
  const nearby = rankNearbyCities(prague, [prague, kladno, brno]);
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].id, 'kladno');
  assert.ok(nearby[0].km < 40);
}

{
  const nearby = rankNearbyCities(barcelona, [barcelona, santCugat]);
  assert.equal(nearby[0].id, 'sant-cugat');
}

console.log('nearbyCities.test.ts: ok');
