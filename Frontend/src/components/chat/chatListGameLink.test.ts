import { describe, expect, it } from 'vitest';
import { findChatListGameLink, stripChatListGameLink } from './chatListGameLink';

const ID = 'cmupyd5y90000abcdefghijkl';

describe('findChatListGameLink', () => {
  it('finds an in-app game link inside a message', () => {
    const text = `Ищем с женой пару на сб с 10 до 11) https://bandeja.me/games/${ID}`;
    expect(findChatListGameLink(text)).toEqual({ url: `https://bandeja.me/games/${ID}`, gameId: ID });
  });

  it('accepts the chat and live sub-pages', () => {
    expect(findChatListGameLink(`https://bandeja.me/games/${ID}/chat`)?.gameId).toBe(ID);
  });

  it('ignores other hosts, other paths and links cut off by the preview', () => {
    expect(findChatListGameLink(`https://example.com/games/${ID}`)).toBeNull();
    expect(findChatListGameLink(`https://bandeja.me/users/${ID}`)).toBeNull();
    expect(findChatListGameLink('https://bandeja.me/games/cmupyd5y90')).toBeNull();
    expect(findChatListGameLink(null)).toBeNull();
  });
});

describe('stripChatListGameLink', () => {
  it('drops the link and tidies the gap it leaves', () => {
    const link = { url: `https://bandeja.me/games/${ID}`, gameId: ID };
    expect(stripChatListGameLink(`Join us  ${link.url} tonight`, link)).toBe('Join us tonight');
  });
});
