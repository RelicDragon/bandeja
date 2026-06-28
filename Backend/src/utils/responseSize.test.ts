import { getResponseBodySize } from './responseSize';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
}

const objectBody = { success: false, message: 'Too many messages, please slow down.' };
assert(
  getResponseBodySize(objectBody) === Buffer.byteLength(JSON.stringify(objectBody), 'utf8'),
  'object response bodies are measured as JSON'
);

const bufferBody = Buffer.from('hello');
assert(getResponseBodySize(bufferBody) === bufferBody.byteLength, 'buffers use byteLength');

const typedArrayBody = new Uint8Array([1, 2, 3]);
assert(getResponseBodySize(typedArrayBody) === typedArrayBody.byteLength, 'typed arrays use byteLength');

assert(getResponseBodySize('čaos') === Buffer.byteLength('čaos', 'utf8'), 'strings are measured as utf8');

console.log('responseSize.test.ts: ok');
