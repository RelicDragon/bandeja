import assert from 'node:assert/strict';
import { expandNameSearchTerms } from './nameSearchTerms';

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

testCyrillicExpandsToLatin();
testLatinExpandsToCyrillic();
testDedupesCaseInsensitive();
testBlank();
console.log('nameSearchTerms.test.ts: ok');
