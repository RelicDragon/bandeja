import assert from 'node:assert/strict';
import { telegramHtmlTextLength } from '../../shared/telegramMarkdown';
import {
  TELEGRAM_MESSAGE_MAX,
  agentAnswerToTelegramMessages,
  agentMarkdownToTelegramHtml,
  isWellFormedTelegramHtml,
  splitAgentMarkdown,
} from '../agentTelegramHtml';

function testFormatting(): void {
  assert.equal(agentMarkdownToTelegramHtml('**Bold** and *italic*'), '<b>Bold</b> and <i>italic</i>');
  assert.equal(agentMarkdownToTelegramHtml('Use `code` here'), 'Use <code>code</code> here');
  assert.equal(
    agentMarkdownToTelegramHtml('- one\n- **two**\n1. three'),
    '• one\n• <b>two</b>\n1. three',
  );
  assert.equal(
    agentMarkdownToTelegramHtml('[Game](https://bandeja.me/games/abc?x=1&y=2)'),
    '<a href="https://bandeja.me/games/abc?x=1&amp;y=2">Game</a>',
  );
  assert.equal(agentMarkdownToTelegramHtml('```\n<b>x</b>\n```'), '<pre>&lt;b&gt;x&lt;/b&gt;</pre>');
}

function testInjectionIsEscaped(): void {
  assert.equal(
    agentMarkdownToTelegramHtml('<script>alert(1)</script> <b>hi</b>'),
    '&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;hi&lt;/b&gt;',
  );
  assert.equal(agentMarkdownToTelegramHtml('Tom & Jerry &amp;'), 'Tom &amp; Jerry &amp;amp;');
  // Non-http(s) schemes never become links.
  assert.equal(agentMarkdownToTelegramHtml('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
  assert.equal(agentMarkdownToTelegramHtml('[open](tg://resolve?domain=evil)'), 'open');
  // A quote in a URL can't break out of the attribute.
  const quoted = agentMarkdownToTelegramHtml('[a](https://x.com/"onclick=alert(1))');
  assert.ok(!quoted.includes('"onclick'), quoted);
  assert.ok(isWellFormedTelegramHtml(quoted), quoted);
  // Link label with markup inside is still well-formed.
  assert.ok(isWellFormedTelegramHtml(agentMarkdownToTelegramHtml('[**bold** <i>](https://a.b)')));
}

function testOverlappingMarkupFallsBackToPlainText(): void {
  const source = '**a _b** c_';
  const html = agentMarkdownToTelegramHtml(source);
  assert.ok(isWellFormedTelegramHtml(html), html);
  assert.equal(html, '**a _b** c_');
  const withTags = agentMarkdownToTelegramHtml('**x _y** <z>_');
  assert.ok(isWellFormedTelegramHtml(withTags), withTags);
  assert.ok(withTags.includes('&lt;z&gt;'));
}

function testWellFormedChecker(): void {
  assert.equal(isWellFormedTelegramHtml('<b>x <i>y</i></b>'), true);
  assert.equal(isWellFormedTelegramHtml('<b><i>x</b></i>'), false);
  assert.equal(isWellFormedTelegramHtml('<b>open'), false);
  assert.equal(isWellFormedTelegramHtml('<script>x</script>'), false);
  assert.equal(isWellFormedTelegramHtml('<a href="javascript:x">y</a>'), false);
  assert.equal(isWellFormedTelegramHtml('<b onclick="x">y</b>'), false);
  assert.equal(isWellFormedTelegramHtml('a < b'), false);
  assert.equal(isWellFormedTelegramHtml('<pre><code class="language-ts">x</code></pre>'), true);
}

function testStreamingPartialsStaySafe(): void {
  for (const partial of ['**bol', '`code', '[link](https://ex', '```\nx', '_it', '<b']) {
    const html = agentMarkdownToTelegramHtml(partial);
    assert.ok(isWellFormedTelegramHtml(html), `${partial} → ${html}`);
  }
}

function testSplitting(): void {
  const paragraph = `${'word '.repeat(150).trim()}.`;
  const long = Array.from({ length: 20 }, () => paragraph).join('\n\n');
  const pieces = splitAgentMarkdown(long, 3800);
  assert.ok(pieces.length > 1);
  for (const piece of pieces) assert.ok(piece.length <= 3800, `piece ${piece.length}`);
  assert.equal(pieces.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '));

  const messages = agentAnswerToTelegramMessages(`${'**b** & <x> '.repeat(1500)}`);
  assert.ok(messages.length >= 2);
  for (const html of messages) {
    assert.ok(telegramHtmlTextLength(html) <= TELEGRAM_MESSAGE_MAX);
    assert.ok(isWellFormedTelegramHtml(html));
  }
  // One overlong word is hard-cut.
  assert.deepEqual(splitAgentMarkdown('x'.repeat(9), 4), ['xxxx', 'xxxx', 'x']);
  assert.deepEqual(splitAgentMarkdown('   '), []);
}

void (() => {
  testFormatting();
  testInjectionIsEscaped();
  testOverlappingMarkupFallsBackToPlainText();
  testWellFormedChecker();
  testStreamingPartialsStaySafe();
  testSplitting();
  console.log('agentTelegramHtml.test.ts: ok');
})();
