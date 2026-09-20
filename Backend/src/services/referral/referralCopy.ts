/**
 * PRD 351 — backend copy for referral pushes, Telegram `/invite` and the
 * `REFERRAL_JOINED` notification.
 *
 * Kept out of `utils/translations.ts` for the same reason `gameSeriesCopy.ts`
 * and `liveCopy.ts` are: that file is one flat object per locale and eleven
 * insertions into it, by one of a dozen concurrent agents, is a guaranteed
 * merge conflict for no behavioural gain. The resolver has the same contract as
 * `t(key, lang)` — unknown language falls back to English, unknown key returns
 * the key. Placeholders are `{name}`-style, matching `liveT` / `seriesT`.
 */

export type ReferralCopyKey =
  | 'referral.someone'
  | 'referral.joinedTitle'
  | 'referral.joinedBody'
  | 'referral.rewardReferrerTitle'
  | 'referral.rewardReferrerBody'
  | 'referral.rewardReferredTitle'
  | 'referral.rewardReferredBody'
  | 'referral.inviteHeader'
  | 'referral.inviteBody'
  | 'referral.inviteCodeLabel'
  | 'referral.inviteNeedsAccount';

type ReferralCopyBundle = Record<ReferralCopyKey, string>;

const REFERRAL_COPY: Record<string, ReferralCopyBundle> = {
  en: {
    'referral.someone': 'Your friend',
    'referral.joinedTitle': 'Your invite joined',
    'referral.joinedBody': '{name} joined Bandeja. You both get coins after their first game.',
    'referral.rewardReferrerTitle': 'Invite paid off',
    'referral.rewardReferrerBody': '{name} played their first game. +{coins} coins!',
    'referral.rewardReferredTitle': 'Welcome bonus',
    'referral.rewardReferredBody': 'Welcome bonus: +{coins} coins',
    'referral.inviteHeader': 'Invite a friend',
    'referral.inviteBody':
      'Share this link. You both get coins when they play their first game: {referrerCoins} for you, {referredCoins} for them.',
    'referral.inviteCodeLabel': 'Your code',
    'referral.inviteNeedsAccount': 'Link your Bandeja account first with /start.',
  },
  ru: {
    'referral.someone': 'Ваш друг',
    'referral.joinedTitle': 'Ваш друг зарегистрировался',
    'referral.joinedBody': '{name} присоединился к Bandeja. Монеты придут после первой игры.',
    'referral.rewardReferrerTitle': 'Приглашение сработало',
    'referral.rewardReferrerBody': '{name} сыграл первую игру. +{coins} монет!',
    'referral.rewardReferredTitle': 'Приветственный бонус',
    'referral.rewardReferredBody': 'Приветственный бонус: +{coins} монет',
    'referral.inviteHeader': 'Пригласите друга',
    'referral.inviteBody':
      'Поделитесь ссылкой. Оба получите монеты после его первой игры: {referrerCoins} вам и {referredCoins} ему.',
    'referral.inviteCodeLabel': 'Ваш код',
    'referral.inviteNeedsAccount': 'Сначала привяжите аккаунт Bandeja командой /start.',
  },
  sr: {
    'referral.someone': 'Tvoj prijatelj',
    'referral.joinedTitle': 'Tvoja pozivnica je prihvaćena',
    'referral.joinedBody': '{name} se pridružio Bandeji. Novčići stižu posle prve igre.',
    'referral.rewardReferrerTitle': 'Pozivnica se isplatila',
    'referral.rewardReferrerBody': '{name} je odigrao prvu igru. +{coins} novčića!',
    'referral.rewardReferredTitle': 'Bonus dobrodošlice',
    'referral.rewardReferredBody': 'Bonus dobrodošlice: +{coins} novčića',
    'referral.inviteHeader': 'Pozovi prijatelja',
    'referral.inviteBody':
      'Podeli ovaj link. Oboje dobijate novčiće posle njegove prve igre: {referrerCoins} tebi, {referredCoins} njemu.',
    'referral.inviteCodeLabel': 'Tvoj kod',
    'referral.inviteNeedsAccount': 'Prvo poveži svoj Bandeja nalog komandom /start.',
  },
  es: {
    'referral.someone': 'Tu amigo',
    'referral.joinedTitle': 'Tu invitado se unió',
    'referral.joinedBody': '{name} se unió a Bandeja. Ambos recibiréis monedas tras su primer partido.',
    'referral.rewardReferrerTitle': 'La invitación valió la pena',
    'referral.rewardReferrerBody': '{name} jugó su primer partido. ¡+{coins} monedas!',
    'referral.rewardReferredTitle': 'Bono de bienvenida',
    'referral.rewardReferredBody': 'Bono de bienvenida: +{coins} monedas',
    'referral.inviteHeader': 'Invita a un amigo',
    'referral.inviteBody':
      'Comparte este enlace. Ambos ganáis monedas cuando juegue su primer partido: {referrerCoins} para ti y {referredCoins} para él.',
    'referral.inviteCodeLabel': 'Tu código',
    'referral.inviteNeedsAccount': 'Primero vincula tu cuenta de Bandeja con /start.',
  },
  cs: {
    'referral.someone': 'Tvůj kamarád',
    'referral.joinedTitle': 'Tvoje pozvánka byla přijata',
    'referral.joinedBody': '{name} se připojil k Bandeji. Mince přijdou po jeho první hře.',
    'referral.rewardReferrerTitle': 'Pozvánka se vyplatila',
    'referral.rewardReferrerBody': '{name} odehrál první hru. +{coins} mincí!',
    'referral.rewardReferredTitle': 'Uvítací bonus',
    'referral.rewardReferredBody': 'Uvítací bonus: +{coins} mincí',
    'referral.inviteHeader': 'Pozvi kamaráda',
    'referral.inviteBody':
      'Sdílej tento odkaz. Oba dostanete mince po jeho první hře: {referrerCoins} tobě, {referredCoins} jemu.',
    'referral.inviteCodeLabel': 'Tvůj kód',
    'referral.inviteNeedsAccount': 'Nejdřív propoj svůj účet Bandeja příkazem /start.',
  },
  ar: {
    'referral.someone': 'صديقك',
    'referral.joinedTitle': 'انضم من دعوته',
    'referral.joinedBody': 'انضم {name} إلى Bandeja. ستصل العملات بعد أول مباراة له.',
    'referral.rewardReferrerTitle': 'دعوتك أثمرت',
    'referral.rewardReferrerBody': 'لعب {name} أول مباراة له. ‏+{coins} عملة!',
    'referral.rewardReferredTitle': 'مكافأة الترحيب',
    'referral.rewardReferredBody': 'مكافأة الترحيب: ‏+{coins} عملة',
    'referral.inviteHeader': 'ادعُ صديقًا',
    'referral.inviteBody':
      'شارك هذا الرابط. كلاكما يحصل على عملات بعد أول مباراة له: {referrerCoins} لك و{referredCoins} له.',
    'referral.inviteCodeLabel': 'رمزك',
    'referral.inviteNeedsAccount': 'اربط حساب Bandeja أولًا عبر /start.',
  },
  zh: {
    'referral.someone': '你的朋友',
    'referral.joinedTitle': '你邀请的人已加入',
    'referral.joinedBody': '{name} 加入了 Bandeja。他完成首场比赛后你们都会获得金币。',
    'referral.rewardReferrerTitle': '邀请奏效了',
    'referral.rewardReferrerBody': '{name} 打完了第一场比赛。+{coins} 金币！',
    'referral.rewardReferredTitle': '欢迎奖励',
    'referral.rewardReferredBody': '欢迎奖励：+{coins} 金币',
    'referral.inviteHeader': '邀请朋友',
    'referral.inviteBody':
      '分享这个链接。他打完首场比赛后你们都能获得金币：你 {referrerCoins}，他 {referredCoins}。',
    'referral.inviteCodeLabel': '你的邀请码',
    'referral.inviteNeedsAccount': '请先用 /start 绑定你的 Bandeja 账号。',
  },
  id: {
    'referral.someone': 'Temanmu',
    'referral.joinedTitle': 'Undanganmu bergabung',
    'referral.joinedBody': '{name} bergabung ke Bandeja. Koin datang setelah pertandingan pertamanya.',
    'referral.rewardReferrerTitle': 'Undanganmu membuahkan hasil',
    'referral.rewardReferrerBody': '{name} memainkan pertandingan pertamanya. +{coins} koin!',
    'referral.rewardReferredTitle': 'Bonus selamat datang',
    'referral.rewardReferredBody': 'Bonus selamat datang: +{coins} koin',
    'referral.inviteHeader': 'Undang teman',
    'referral.inviteBody':
      'Bagikan tautan ini. Kalian berdua dapat koin setelah dia bermain pertama kali: {referrerCoins} untukmu, {referredCoins} untuknya.',
    'referral.inviteCodeLabel': 'Kodemu',
    'referral.inviteNeedsAccount': 'Hubungkan akun Bandeja dulu dengan /start.',
  },
  hi: {
    'referral.someone': 'आपका दोस्त',
    'referral.joinedTitle': 'आपका आमंत्रित व्यक्ति जुड़ गया',
    'referral.joinedBody': '{name} Bandeja से जुड़ गए। पहले मैच के बाद दोनों को सिक्के मिलेंगे।',
    'referral.rewardReferrerTitle': 'आमंत्रण काम आया',
    'referral.rewardReferrerBody': '{name} ने पहला मैच खेला। +{coins} सिक्के!',
    'referral.rewardReferredTitle': 'स्वागत बोनस',
    'referral.rewardReferredBody': 'स्वागत बोनस: +{coins} सिक्के',
    'referral.inviteHeader': 'दोस्त को बुलाएँ',
    'referral.inviteBody':
      'यह लिंक भेजें। उनके पहले मैच के बाद दोनों को सिक्के मिलेंगे: आपको {referrerCoins}, उन्हें {referredCoins}।',
    'referral.inviteCodeLabel': 'आपका कोड',
    'referral.inviteNeedsAccount': 'पहले /start से अपना Bandeja खाता जोड़ें।',
  },
  th: {
    'referral.someone': 'เพื่อนของคุณ',
    'referral.joinedTitle': 'คนที่คุณชวนสมัครแล้ว',
    'referral.joinedBody': '{name} เข้าร่วม Bandeja แล้ว เหรียญจะมาหลังเกมแรกของเขา',
    'referral.rewardReferrerTitle': 'คำชวนได้ผล',
    'referral.rewardReferrerBody': '{name} เล่นเกมแรกแล้ว +{coins} เหรียญ!',
    'referral.rewardReferredTitle': 'โบนัสต้อนรับ',
    'referral.rewardReferredBody': 'โบนัสต้อนรับ: +{coins} เหรียญ',
    'referral.inviteHeader': 'ชวนเพื่อน',
    'referral.inviteBody':
      'แชร์ลิงก์นี้ ทั้งคู่จะได้เหรียญหลังเกมแรกของเขา: คุณ {referrerCoins} เขา {referredCoins}',
    'referral.inviteCodeLabel': 'รหัสของคุณ',
    'referral.inviteNeedsAccount': 'เชื่อมบัญชี Bandeja ก่อนด้วย /start',
  },
  ja: {
    'referral.someone': 'お友達',
    'referral.joinedTitle': '招待した人が参加しました',
    'referral.joinedBody':
      '{name} さんが Bandeja に参加しました。初試合のあと、二人ともコインがもらえます。',
    'referral.rewardReferrerTitle': '招待が実りました',
    'referral.rewardReferrerBody': '{name} さんが初試合をプレーしました。+{coins} コイン！',
    'referral.rewardReferredTitle': 'ウェルカムボーナス',
    'referral.rewardReferredBody': 'ウェルカムボーナス：+{coins} コイン',
    'referral.inviteHeader': '友達を招待',
    'referral.inviteBody':
      'このリンクを共有しましょう。相手が初試合をプレーすると二人ともコインがもらえます：あなたに {referrerCoins}、相手に {referredCoins}。',
    'referral.inviteCodeLabel': 'あなたのコード',
    'referral.inviteNeedsAccount': 'まず /start で Bandeja アカウントを連携してください。',
  },
};

/** `t(key, lang)` for the referral namespace. Unknown language falls back to `en`. */
export function referralT(
  key: ReferralCopyKey,
  language: string | null | undefined,
  params: Record<string, string | number> = {},
): string {
  const lang = language && REFERRAL_COPY[language] ? language : 'en';
  const template = REFERRAL_COPY[lang][key] ?? REFERRAL_COPY.en[key] ?? key;
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    template,
  );
}

export const REFERRAL_COPY_LANGUAGES = Object.keys(REFERRAL_COPY);
