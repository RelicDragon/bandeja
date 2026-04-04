import prisma from '../../config/database';
import { ChatContextType, ChatSyncEventType, ChatType, MessageState } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { computeContentSearchable } from '../../utils/messageSearchContent';
import { updateLastMessagePreview } from './lastMessagePreview.service';
import { MessageService } from './message.service';
import { ChatSyncEventService } from './chatSyncEvent.service';

export async function isWelcomeSenderValid(senderId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: senderId },
    select: { id: true },
  });
  return !!user;
}

export const CITY_GROUP_WELCOME_MESSAGE_EN =
  "👋 Welcome to your city's chat!\n\nThis is an automated general group for all local players. Feel free to post here whenever you're looking for someone to play with or to share a link to your game.\n\n🌍 Tip: You can use automated translations to easily chat with everyone!";

export const CITY_GROUP_WELCOME_TRANSLATIONS: Record<string, string> = {
  es: '👋 ¡Bienvenido al chat de tu ciudad!\n\nEste es un grupo general automatizado para todos los jugadores locales. No dudes en escribir por aquí si buscas a alguien con quien jugar o para compartir un enlace a tu partida.\n\n🌍 Consejo: ¡Puedes usar la traducción automática para chatear con todos fácilmente!',
  ru: '👋 Добро пожаловать в чат вашего города!\n\nЭто автоматическая общая группа для всех местных игроков. Смело пишите сюда, если ищете с кем поиграть, или делитесь ссылкой на свою игру.\n\n🌍 Подсказка: используйте автоматический перевод, чтобы легко общаться со всеми!',
  sr: '👋 Dobrodošli u chat vašeg grada!\n\nOvo je automatska opšta grupa za sve lokalne igrače. Slobodno pišite ovde ako tražite nekoga za igru ili želite da podelite link do svoje igre.\n\n🌍 Savet: Možete koristiti automatski prevod da biste se lako dopisivali sa svima!',
  cs: '👋 Vítejte v chatu vašeho města!\n\nToto je automatická obecná skupina pro všechny místní hráče. Neváhejte sem napsat, pokud hledáte někoho na hraní, nebo sdílet odkaz na svou hru.\n\n🌍 Tip: Můžete využít automatické překlady a snadno tak komunikovat se všemi!',
};

export async function createCityGroupWelcomeMessage(
  groupChannelId: string,
  senderId: string
): Promise<void> {
  if (await cityGroupHasWelcomeMessage(groupChannelId, senderId)) {
    return;
  }
  if (!(await isWelcomeSenderValid(senderId))) {
    throw new ApiError(400, 'CITY_GROUP_WELCOME_SENDER_ID must be a valid user ID');
  }
  const content = CITY_GROUP_WELCOME_MESSAGE_EN;
  const include = MessageService.getMessageInclude();
  await prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.create({
      data: {
        chatContextType: ChatContextType.GROUP,
        contextId: groupChannelId,
        senderId,
        content,
        contentSearchable: computeContentSearchable(content),
        mediaUrls: [],
        thumbnailUrls: [],
        chatType: ChatType.PUBLIC,
        state: MessageState.SENT,
      },
      include,
    });

    await tx.messageTranslation.createMany({
      data: Object.entries(CITY_GROUP_WELCOME_TRANSLATIONS).map(([languageCode, translation]) => ({
        messageId: message.id,
        languageCode,
        translation,
        createdBy: senderId,
      })),
    });

    await tx.pinnedMessage.create({
      data: {
        chatContextType: ChatContextType.GROUP,
        contextId: groupChannelId,
        chatType: ChatType.PUBLIC,
        messageId: message.id,
        order: 0,
        pinnedById: senderId,
      },
    });

    const withTranslations = await tx.chatMessage.findUnique({
      where: { id: message.id },
      include,
    });
    if (!withTranslations) return;

    const syncSeq = await ChatSyncEventService.appendEventInTransaction(
      tx,
      ChatContextType.GROUP,
      groupChannelId,
      ChatSyncEventType.MESSAGE_CREATED,
      { message: withTranslations }
    );
    await tx.chatMessage.update({
      where: { id: message.id },
      data: { serverSyncSeq: syncSeq },
    });

    await ChatSyncEventService.appendEventInTransaction(
      tx,
      ChatContextType.GROUP,
      groupChannelId,
      ChatSyncEventType.MESSAGE_PINNED,
      {
        messageId: message.id,
        chatType: ChatType.PUBLIC,
        order: 0,
        pinnedById: senderId,
      }
    );
  });

  await updateLastMessagePreview(ChatContextType.GROUP, groupChannelId);
}

export async function cityGroupHasWelcomeMessage(
  groupChannelId: string,
  senderId: string
): Promise<boolean> {
  const existing = await prisma.chatMessage.findFirst({
    where: {
      chatContextType: ChatContextType.GROUP,
      contextId: groupChannelId,
      senderId,
      content: CITY_GROUP_WELCOME_MESSAGE_EN,
    },
  });
  return !!existing;
}
