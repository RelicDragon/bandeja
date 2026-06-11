import { convertMentionsToPlaintext } from './parseMentions';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(
  convertMentionsToPlaintext('Hello @[John Doe](user-1) there') === 'Hello @John Doe there',
  'single mention',
);
assert(
  convertMentionsToPlaintext('@[A](1) and @[B](2)') === '@A and @B',
  'multiple mentions',
);
assert(
  convertMentionsToPlaintext('no mentions') === 'no mentions',
  'plain text unchanged',
);

console.log('parseMentions.test.ts: ok');
