import assert from 'node:assert/strict';
import { expandNameSearchTerms, matchesPersonSearch, matchesSearch } from './nameSearchTerms';

function testCyrillicExpandsToLatin(): void {
  const variants = expandNameSearchTerms('ив');
  assert.ok(variants.includes('ив'));
  assert.ok(variants.includes('iv'));
}

function testLatinExpandsToCyrillic(): void {
  const variants = expandNameSearchTerms('iv');
  assert.ok(variants.includes('iv'));
  assert.ok(variants.includes('ив'));
}

function testDedupesCaseInsensitive(): void {
  const variants = expandNameSearchTerms('Iv');
  const keys = variants.map((v) => v.toLowerCase());
  assert.equal(new Set(keys).size, keys.length);
}

function testBlank(): void {
  assert.deepEqual(expandNameSearchTerms('   '), []);
}

function testSerbianLatinFromRussianCyrillic(): void {
  assert.equal(matchesSearch('Анджела', 'Andjela Djermanovic'), true);
  assert.equal(matchesSearch('Дьерманович', 'Andjela Djermanovic'), true);
  assert.equal(matchesSearch('Спринцхунас', 'Polina Sprinzhunas'), true);
  assert.equal(
    matchesPersonSearch('Анджела Дьерманович', {
      firstName: 'Andjela',
      lastName: 'Djermanovic',
    }),
    true,
  );
  const andjela = expandNameSearchTerms('Анджела').map((v) => v.toLowerCase());
  assert.ok(andjela.includes('andjela'));
  const last = expandNameSearchTerms('Дьерманович').map((v) => v.toLowerCase());
  assert.ok(last.includes('djermanovic'));
  const sprinz = expandNameSearchTerms('Спринцхунас').map((v) => v.toLowerCase());
  assert.ok(sprinz.includes('sprinzhunas'));
  assert.equal(matchesSearch('Анджела', 'Aleksandra Konikka'), false);
  assert.equal(matchesSearch('ан', 'Andjela Djermanovic'), true);
  assert.equal(matchesSearch('Андж', 'Andjela Djermanovic'), true);
  assert.equal(matchesSearch('Анджел', 'Andjela Djermanovic'), true);
  assert.equal(matchesSearch('Спринц', 'Polina Sprinzhunas'), true);
}

testCyrillicExpandsToLatin();
testLatinExpandsToCyrillic();
testDedupesCaseInsensitive();
testBlank();
testSerbianLatinFromRussianCyrillic();
console.log('nameSearchTerms.test.ts: ok');
