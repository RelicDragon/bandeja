import assert from 'node:assert/strict';
import {
  detectGiphyUrlOnly,
  extractGiphyIdFromUrl,
  isDirectGiphyMediaUrl,
  buildGiphyCdnGifUrl,
} from './giphyUrlDetect';
import { isAllowedGiphyHost } from './giphyHosts';

assert.equal(isAllowedGiphyHost('giphy.com'), true);
assert.equal(isAllowedGiphyHost('www.giphy.com'), true);
assert.equal(isAllowedGiphyHost('media.giphy.com'), true);
assert.equal(isAllowedGiphyHost('media2.giphy.com'), true);
assert.equal(isAllowedGiphyHost('i.giphy.com'), true);
assert.equal(isAllowedGiphyHost('i1.giphy.com'), true);
assert.equal(isAllowedGiphyHost('api.giphy.com'), true);
assert.equal(isAllowedGiphyHost('klipy.com'), true);
assert.equal(isAllowedGiphyHost('www.klipy.com'), true);
assert.equal(isAllowedGiphyHost('tenor.com'), true);
assert.equal(isAllowedGiphyHost('media.tenor.com'), true);
assert.equal(isAllowedGiphyHost('media1.tenor.com'), true);
assert.equal(isAllowedGiphyHost('c.tenor.com'), true);
assert.equal(isAllowedGiphyHost('evil.com'), false);
assert.equal(isAllowedGiphyHost('giphy.com.evil.com'), false);
assert.equal(isAllowedGiphyHost('notgiphy.com'), false);
assert.equal(isAllowedGiphyHost('tenor.com.evil.com'), false);

assert.equal(
  detectGiphyUrlOnly('\u200Bhttps://giphy.com/gifs/funny-cat-FiGiRei2ICzzG\uFEFF'),
  'https://giphy.com/gifs/funny-cat-FiGiRei2ICzzG'
);
assert.equal(
  detectGiphyUrlOnly('  <https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif>  '),
  'https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif'
);
assert.equal(
  detectGiphyUrlOnly('check https://giphy.com/gifs/funny-cat-FiGiRei2ICzzG please'),
  null
);
assert.equal(
  detectGiphyUrlOnly('https://giphy.com/gifs/a https://giphy.com/gifs/b'),
  null
);
assert.equal(
  detectGiphyUrlOnly(
    'https://tenor.com/view/petty-parker-smoke-snoop-dogg-homer-simpson-disappear-gif-17093677'
  ),
  'https://tenor.com/view/petty-parker-smoke-snoop-dogg-homer-simpson-disappear-gif-17093677'
);
assert.equal(
  detectGiphyUrlOnly('https://media.tenor.com/rYCdWzuqXIIAAAAM/petty-parker-smoke.gif'),
  'https://media.tenor.com/rYCdWzuqXIIAAAAM/petty-parker-smoke.gif'
);
assert.equal(
  detectGiphyUrlOnly('https://klipy.com/gifs/hello-hi-662'),
  'https://klipy.com/gifs/hello-hi-662'
);
assert.equal(detectGiphyUrlOnly('http://giphy.com/gifs/FiGiRei2ICzzG'), null);
assert.equal(
  detectGiphyUrlOnly('https://static1.klipy.com/party.gif'),
  'https://static1.klipy.com/party.gif'
);
assert.equal(detectGiphyUrlOnly(''), null);
assert.equal(detectGiphyUrlOnly(null), null);

assert.equal(extractGiphyIdFromUrl('https://giphy.com/gifs/funny-cat-FiGiRei2ICzzG'), 'FiGiRei2ICzzG');
assert.equal(extractGiphyIdFromUrl('https://giphy.com/gifs/FiGiRei2ICzzG'), 'FiGiRei2ICzzG');
assert.equal(extractGiphyIdFromUrl('https://giphy.com/embed/FiGiRei2ICzzG'), 'FiGiRei2ICzzG');
assert.equal(
  extractGiphyIdFromUrl('https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif'),
  'FiGiRei2ICzzG'
);
assert.equal(extractGiphyIdFromUrl('https://evil.com/gifs/FiGiRei2ICzzG'), null);
assert.equal(extractGiphyIdFromUrl('https://giphy.com/gifs/bad%encoding'), null);

assert.equal(
  isDirectGiphyMediaUrl('https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif'),
  true
);
assert.equal(isDirectGiphyMediaUrl('https://giphy.com/gifs/FiGiRei2ICzzG'), false);
assert.equal(isDirectGiphyMediaUrl('http://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif'), false);
assert.equal(isDirectGiphyMediaUrl('https://media.giphy.com:8443/media/FiGiRei2ICzzG/giphy.gif'), false);
assert.equal(isDirectGiphyMediaUrl('https://static.klipy.com/FiGiRei2ICzzG.gif'), false);
assert.equal(buildGiphyCdnGifUrl('FiGiRei2ICzzG'), 'https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif');

console.log('giphyUrlDetect.test.ts: ok');
