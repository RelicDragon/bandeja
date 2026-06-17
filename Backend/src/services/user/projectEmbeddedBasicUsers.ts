import { Sport } from '@prisma/client';
import { projectUserByPrimarySport, projectUserForSportContext } from './userSportProfile.service';
import type { SportProjectedUserFields } from './userSportProfile.service';

type UserWithProfiles = Parameters<typeof projectUserByPrimarySport>[0];

type ProjectedUser<T> = T extends null | undefined
  ? T
  : Omit<T, 'sportProfiles'> & SportProjectedUserFields;

export function projectEmbeddedUserByPrimarySport<T extends UserWithProfiles | null | undefined>(
  user: T,
): ProjectedUser<T> {
  if (!user) return user as ProjectedUser<T>;
  return projectUserByPrimarySport(user);
}

export function projectBetEmbeddedUsers<
  T extends {
    creator?: UserWithProfiles | null;
    acceptedByUser?: UserWithProfiles | null;
    winner?: UserWithProfiles | null;
    participants?: Array<{ user: UserWithProfiles }> | null;
  },
>(bet: T, sport: Sport): T {
  return {
    ...bet,
    creator: bet.creator ? projectUserForSportContext(bet.creator, sport) : bet.creator,
    acceptedByUser: bet.acceptedByUser
      ? projectUserForSportContext(bet.acceptedByUser, sport)
      : bet.acceptedByUser,
    winner: bet.winner ? projectUserForSportContext(bet.winner, sport) : bet.winner,
    participants: bet.participants?.map((p) => ({
      ...p,
      user: projectUserForSportContext(p.user, sport),
    })),
  };
}

export function projectBetForGameSport<
  T extends { game: { sport: Sport } } & Parameters<typeof projectBetEmbeddedUsers>[0],
>(bet: T): Omit<T, 'game'> {
  const sport = bet.game.sport;
  const rest = { ...bet } as Parameters<typeof projectBetEmbeddedUsers>[0] & { game?: unknown };
  delete rest.game;
  return projectBetEmbeddedUsers(rest, sport) as Omit<T, 'game'>;
}

export function projectBetsForGameSport<T extends Parameters<typeof projectBetForGameSport>[0]>(
  bets: T[],
): Array<Omit<T, 'game'>> {
  return bets.map(projectBetForGameSport);
}

export function projectTransactionEmbeddedUsers<
  T extends {
    fromUser?: UserWithProfiles | null;
    toUser?: UserWithProfiles | null;
  },
>(transaction: T): T {
  return {
    ...transaction,
    fromUser: projectEmbeddedUserByPrimarySport(transaction.fromUser),
    toUser: projectEmbeddedUserByPrimarySport(transaction.toUser),
  };
}

export function projectMarketItemEmbeddedUsers<
  T extends {
    seller?: UserWithProfiles | null;
    buyer?: UserWithProfiles | null;
    participants?: Array<{ user: UserWithProfiles }> | null;
  },
>(item: T): T {
  return {
    ...item,
    seller: projectEmbeddedUserByPrimarySport(item.seller),
    buyer: projectEmbeddedUserByPrimarySport(item.buyer),
    participants: item.participants?.map((p) => ({
      ...p,
      user: projectEmbeddedUserByPrimarySport(p.user),
    })),
  };
}

export function projectMarketBidEmbeddedUser<T extends { bidder?: UserWithProfiles | null }>(
  bid: T,
): T {
  return {
    ...bid,
    bidder: projectEmbeddedUserByPrimarySport(bid.bidder),
  };
}

type MessageWithEmbeddedUsers = {
  sender?: UserWithProfiles | null;
  replyTo?: {
    sender?: UserWithProfiles | null;
    [key: string]: unknown;
  } | null;
  reactions?: Array<{ user: UserWithProfiles; [key: string]: unknown }>;
  readReceipts?: Array<{ user: UserWithProfiles; [key: string]: unknown }>;
  poll?: {
    options?: Array<{ votes?: Array<{ user?: UserWithProfiles; [key: string]: unknown }> }>;
    votes?: Array<{ user?: UserWithProfiles; [key: string]: unknown }>;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export function projectMessageEmbeddedUsers<T extends MessageWithEmbeddedUsers>(
  message: T,
  sport: Sport,
): T {
  const project = (u: UserWithProfiles | null | undefined) =>
    u ? projectUserForSportContext(u, sport) : u;

  return {
    ...message,
    sender: project(message.sender),
    replyTo: message.replyTo
      ? {
          ...message.replyTo,
          sender: project(message.replyTo.sender),
        }
      : message.replyTo,
    reactions: message.reactions?.map((r) => ({
      ...r,
      user: project(r.user)!,
    })),
    readReceipts: message.readReceipts?.map((r) => ({
      ...r,
      user: project(r.user)!,
    })),
    poll: message.poll
      ? {
          ...message.poll,
          options: message.poll.options?.map((o) => ({
            ...o,
            votes: o.votes?.map((v) => ({
              ...v,
              user: v.user ? project(v.user) : v.user,
            })),
          })),
          votes: message.poll.votes?.map((v) => ({
            ...v,
            user: v.user ? project(v.user) : v.user,
          })),
        }
      : message.poll,
  };
}

export function projectMessagesEmbeddedUsers<T extends MessageWithEmbeddedUsers>(
  messages: T[],
  sport: Sport,
): T[] {
  return messages.map((m) => projectMessageEmbeddedUsers(m, sport));
}

type GroupChannelWithEmbeddedUsers = {
  bug?: { sender?: UserWithProfiles | null; [key: string]: unknown } | null;
  marketItem?: { seller?: UserWithProfiles | null; [key: string]: unknown } | null;
  buyer?: UserWithProfiles | null;
  lastMessageSender?: UserWithProfiles | null;
  lastMessage?: {
    sender?: UserWithProfiles | null;
    [key: string]: unknown;
  } | null;
  participants?: Array<{ user?: UserWithProfiles | null; [key: string]: unknown }> | null;
  [key: string]: unknown;
};

/** Legacy clients read top-level `user.level` on bug/market/group channel embeds. */
export function projectGroupChannelEmbeddedUsers<T extends Record<string, unknown>>(channel: T): T {
  const project = projectEmbeddedUserByPrimarySport;
  const bug = channel.bug as GroupChannelWithEmbeddedUsers['bug'];
  const marketItem = channel.marketItem as GroupChannelWithEmbeddedUsers['marketItem'];
  const lastMessage = channel.lastMessage as GroupChannelWithEmbeddedUsers['lastMessage'];
  const buyer = channel.buyer as UserWithProfiles | null | undefined;
  const lastMessageSender = channel.lastMessageSender as UserWithProfiles | null | undefined;
  const participants = channel.participants as GroupChannelWithEmbeddedUsers['participants'];

  return {
    ...channel,
    bug: bug
      ? {
          ...bug,
          sender: project(bug.sender),
        }
      : bug,
    marketItem: marketItem
      ? {
          ...marketItem,
          seller: project(marketItem.seller),
        }
      : marketItem,
    buyer: project(buyer),
    lastMessageSender: project(lastMessageSender),
    lastMessage: lastMessage
      ? {
          ...lastMessage,
          sender: project(lastMessage.sender),
        }
      : lastMessage,
    participants: participants?.map((p) => ({
      ...p,
      user: project(p.user),
    })),
  };
}
