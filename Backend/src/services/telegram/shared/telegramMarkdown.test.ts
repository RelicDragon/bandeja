import assert from 'node:assert/strict';
import {
  markdownToTelegramHtml,
  telegramHtmlTextLength,
  trimTelegramHtml,
} from './telegramMarkdown';

function testBoldAndBullets(): void {
  const summary = [
    '**Самые жаркие матчи:**',
    '- **Раунд 3, матч 2:** Садретдинова и Вороная против Лобановой — 4:17.',
    '* **Раунд 11, матч 1:** Яковлева против Половинки — 6:15.',
  ].join('\n');

  assert.equal(
    markdownToTelegramHtml(summary),
    [
      '<b>Самые жаркие матчи:</b>',
      '• <b>Раунд 3, матч 2:</b> Садретдинова и Вороная против Лобановой — 4:17.',
      '• <b>Раунд 11, матч 1:</b> Яковлева против Половинки — 6:15.',
    ].join('\n')
  );
}

function testHeadingsItalicAndStrike(): void {
  assert.equal(markdownToTelegramHtml('## Итоги дня'), '<b>Итоги дня</b>');
  assert.equal(markdownToTelegramHtml('This was *almost* a win'), 'This was <i>almost</i> a win');
  assert.equal(markdownToTelegramHtml('This was _almost_ a win'), 'This was <i>almost</i> a win');
  assert.equal(markdownToTelegramHtml('~~lost~~ won'), '<s>lost</s> won');
  assert.equal(markdownToTelegramHtml('score: ||6:15||'), 'score: <tg-spoiler>6:15</tg-spoiler>');
}

function testEscapesHtmlInSourceText(): void {
  assert.equal(
    markdownToTelegramHtml('**A & B** beat <Team> "C"'),
    '<b>A &amp; B</b> beat &lt;Team&gt; &quot;C&quot;'
  );
}

function testLinksAndCodeAreNotMangled(): void {
  assert.equal(
    markdownToTelegramHtml('[Игра](https://bandeja.me/games/a_b?x=1&y=2)'),
    '<a href="https://bandeja.me/games/a_b?x=1&amp;y=2">Игра</a>'
  );
  // Underscores inside a bare URL must not turn into italics.
  assert.equal(
    markdownToTelegramHtml('see https://bandeja.me/a_b_c now'),
    'see https://bandeja.me/a_b_c now'
  );
  assert.equal(markdownToTelegramHtml('use `**raw**` here'), 'use <code>**raw**</code> here');
  assert.equal(markdownToTelegramHtml('```\na < b\n```'), '<pre>a &lt; b</pre>');
}

function testNonFormattingMarkersSurvive(): void {
  assert.equal(markdownToTelegramHtml('snake_case_name stays'), 'snake_case_name stays');
  assert.equal(markdownToTelegramHtml('2 * 3 = 6'), '2 * 3 = 6');
  assert.equal(markdownToTelegramHtml('score 4:17'), 'score 4:17');
}

function testTextLengthIgnoresTagsAndCountsEntities(): void {
  assert.equal(telegramHtmlTextLength('<b>abc</b>'), 3);
  assert.equal(telegramHtmlTextLength('a &amp; b'), 5);
}

function testTrimClosesOpenTags(): void {
  const html = markdownToTelegramHtml('**' + 'a'.repeat(50) + '**');
  const trimmed = trimTelegramHtml(html, 10);

  assert.equal(trimmed, `<b>${'a'.repeat(7)}...</b>`);
  assert.equal(telegramHtmlTextLength(trimmed), 10);
}

function testTrimNeverSplitsAnEntity(): void {
  const html = markdownToTelegramHtml('&&&&&&&&&&');
  const trimmed = trimTelegramHtml(html, 5);

  assert.equal(trimmed, '&amp;&amp;...');
  assert.equal(telegramHtmlTextLength(trimmed), 5);
}

function testShortHtmlIsUntouched(): void {
  const html = markdownToTelegramHtml('**hi**');
  assert.equal(trimTelegramHtml(html, 1024), html);
}

void (() => {
  testBoldAndBullets();
  testHeadingsItalicAndStrike();
  testEscapesHtmlInSourceText();
  testLinksAndCodeAreNotMangled();
  testNonFormattingMarkersSurvive();
  testTextLengthIgnoresTagsAndCountsEntities();
  testTrimClosesOpenTags();
  testTrimNeverSplitsAnEntity();
  testShortHtmlIsUntouched();
  console.log('telegramMarkdown.test.ts: ok');
})();
