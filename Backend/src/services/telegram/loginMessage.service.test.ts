import assert from 'node:assert/strict';
import {
  boldTelegramOtpCode,
  canUseTelegramInlineUrl,
  sendTelegramLoginUrlMessage,
  TelegramLoginReply,
} from './loginMessage.service';

type ReplyCall = {
  text: string;
  options?: unknown;
};

function createReply(calls: ReplyCall[], failFirstWith?: unknown): TelegramLoginReply {
  return async (text, options) => {
    calls.push({ text, options });
    if (calls.length === 1 && failFirstWith) {
      throw failFirstWith;
    }
    return { message_id: calls.length };
  };
}

async function testSkipsInlineButtonForLocalhost(): Promise<void> {
  const calls: ReplyCall[] = [];
  const loginUrl = 'http://localhost:3001/login/key?tg_app=1';

  const message = await sendTelegramLoginUrlMessage({
    reply: createReply(calls),
    message: 'Enter with this code:\n123456',
    buttonText: 'Open Bandeja',
    loginUrl,
  });

  assert.equal(message.message_id, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.options, undefined);
  assert.match(calls[0]?.text ?? '', /123456/);
  assert.match(calls[0]?.text ?? '', /http:\/\/localhost:3001\/login\/key\?tg_app=1/);
}

async function testUsesInlineButtonForPublicUrl(): Promise<void> {
  const calls: ReplyCall[] = [];

  await sendTelegramLoginUrlMessage({
    reply: createReply(calls),
    message: 'Login message',
    buttonText: 'Open Bandeja',
    loginUrl: 'https://bandeja.me/login/key?tg_app=1',
  });

  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.options);
  assert.doesNotMatch(calls[0]?.text ?? '', /https:\/\/bandeja\.me\/login\/key/);
}

async function testFallsBackWhenTelegramRejectsInlineUrl(): Promise<void> {
  const calls: ReplyCall[] = [];
  const loginUrl = 'https://bandeja.me/login/key?tg_app=1';
  const telegramError = {
    error_code: 400,
    description: `Bad Request: inline keyboard button URL '${loginUrl}' is invalid: Wrong HTTP URL`,
  };

  const message = await sendTelegramLoginUrlMessage({
    reply: createReply(calls, telegramError),
    message: 'Login message',
    buttonText: 'Open Bandeja',
    loginUrl,
  });

  assert.equal(message.message_id, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls[0]?.options);
  assert.equal(calls[1]?.options, undefined);
  assert.match(calls[1]?.text ?? '', /https:\/\/bandeja\.me\/login\/key\?tg_app=1/);
}

async function testHtmlMessageKeepsBoldOtpAndEscapesFallbackUrl(): Promise<void> {
  const calls: ReplyCall[] = [];
  const loginUrl = 'http://localhost:3001/login/key?tg_app=1&next=/feed';

  await sendTelegramLoginUrlMessage({
    reply: createReply(calls),
    message: `Code:\n${boldTelegramOtpCode('123456')}`,
    buttonText: 'Open Bandeja',
    loginUrl,
    parseMode: 'HTML',
  });

  const options = calls[0]?.options as { parse_mode?: string } | undefined;
  assert.equal(options?.parse_mode, 'HTML');
  assert.match(calls[0]?.text ?? '', /<b>123456<\/b>/);
  assert.match(
    calls[0]?.text ?? '',
    /http:\/\/localhost:3001\/login\/key\?tg_app=1&amp;next=\/feed/
  );
}

async function testRethrowsOtherErrors(): Promise<void> {
  const calls: ReplyCall[] = [];
  const error = new Error('chat not found');

  await assert.rejects(
    () =>
      sendTelegramLoginUrlMessage({
        reply: createReply(calls, error),
        message: 'Login message',
        buttonText: 'Open Bandeja',
        loginUrl: 'https://bandeja.me/login/key?tg_app=1',
      }),
    /chat not found/
  );

  assert.equal(calls.length, 1);
}

function testInlineUrlEligibility(): void {
  assert.equal(canUseTelegramInlineUrl('http://localhost:3001/login/key'), false);
  assert.equal(canUseTelegramInlineUrl('http://127.0.0.1:3001/login/key'), false);
  assert.equal(canUseTelegramInlineUrl('http://[::1]:3001/login/key'), false);
  assert.equal(canUseTelegramInlineUrl('https://bandeja.me/login/key'), true);
}

void (async () => {
  testInlineUrlEligibility();
  await testSkipsInlineButtonForLocalhost();
  await testUsesInlineButtonForPublicUrl();
  await testFallsBackWhenTelegramRejectsInlineUrl();
  await testHtmlMessageKeepsBoldOtpAndEscapesFallbackUrl();
  await testRethrowsOtherErrors();
  console.log('loginMessage.service.test.ts: ok');
})();
