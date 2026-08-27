import prisma from '../../config/database';
import { ChatSyncEventType } from '@bandeja/chat-contract';
import { ChatContextType, ChatType, MessageState } from '@prisma/client';
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
  ar: '👋 مرحبًا بك في دردشة مدينتك!\n\nهذه مجموعة عامة تلقائية لجميع اللاعبين المحليين. لا تتردد في النشر هنا عندما تبحث عن شخص تلعب معه أو لمشاركة رابط مباراتك.\n\n🌍 نصيحة: يمكنك استخدام الترجمة التلقائية للدردشة مع الجميع بسهولة!',
  zh: '👋 欢迎加入你所在城市的聊天！\n\n这是面向所有本地球员的自动综合群组。想找人打球或分享比赛链接时，随时可以在这里发帖。\n\n🌍 提示：你可以使用自动翻译，轻松与大家聊天！',
  id: '👋 Selamat datang di chat kota Anda!\n\nIni adalah grup umum otomatis untuk semua pemain lokal. Silakan posting di sini kapan saja jika Anda mencari teman bermain atau ingin membagikan tautan permainan.\n\n🌍 Tip: Anda dapat menggunakan terjemahan otomatis agar mudah mengobrol dengan semua orang!',
  hi: '👋 अपने शहर की चैट में आपका स्वागत है!\n\nयह सभी स्थानीय खिलाड़ियों के लिए एक स्वचालित सामान्य ग्रुप है। खेलने के लिए किसी को खोजते समय या अपने खेल का लिंक साझा करते समय यहाँ बेझिझक पोस्ट करें।\n\n🌍 सुझाव: आप स्वचालित अनुवाद का उपयोग करके आसानी से सभी से चैट कर सकते हैं!',
  th: '👋 ยินดีต้อนรับสู่แชทของเมืองคุณ!\n\nนี่คือกลุ่มทั่วไปอัตโนมัติสำหรับผู้เล่นในท้องถิ่นทุกคน โพสต์ได้ทุกเมื่อเมื่อคุณกำลังมองหาคู่เล่น หรือแชร์ลิงก์เกมของคุณ\n\n🌍 เคล็ดลับ: คุณสามารถใช้การแปลอัตโนมัติเพื่อแชทกับทุกคนได้ง่ายขึ้น!',
  ja: '👋 あなたの都市のチャットへようこそ！\n\nこれは地元のプレイヤー全員向けの自動総合グループです。一緒にプレイする相手を探したり、試合のリンクを共有したいときは、気軽に投稿してください。\n\n🌍 ヒント：自動翻訳を使えば、みんなと簡単にチャットできます！',
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
