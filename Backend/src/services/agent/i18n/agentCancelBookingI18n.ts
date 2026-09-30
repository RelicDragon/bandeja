/**
 * UI strings of the agent's `cancel_booking` tool (booking slice 7g, docs/plans/ai-agent-booking.md
 * §14.6), in the 11 app languages. English is the fallback for a missing language or key.
 * `sr` is Serbian Latin.
 */
import { agentLang } from './agentI18n';

export const AGENT_CANCEL_BOOKING_I18N_EN = {
  'label.cancelBooking': 'Preparing to cancel the booking',
  'preview.title': 'Cancel booking at {{club}}',
  'field.unlinkFrom': 'Will be removed from game',
  'field.staysLinked': "Stays linked (you can't edit it)",
  'warn.cancelsAtClub':
    "The reservation is cancelled at the club from the app on your phone. The club's cancellation terms apply. This can't be undone.",
  'warn.gamesKept': 'Linked games are not cancelled; they only lose this booked court.',
  'warn.shared': 'This booking is used by {{count}} games; all of them lose the court.',
  'warn.staysLinked': "It stays linked to {{count}} game(s) you can't edit; ask their organizer to remove it.",
  'refuse.cancelViaClub': 'Only the club can cancel this booking. Contact {{club}} to cancel it.',
  'refuse.cancelViaClubPhone': 'Only the club can cancel this booking. Call {{club}} at {{phone}} to cancel it.',
  'error.notBooker': 'Only the person who made this booking can cancel it.',
  'error.alreadyCancelled': 'This booking is already cancelled.',
  'error.started': "This booking has already started or is over, so it can't be cancelled.",
  'error.unknownState': "This booking's status is unclear. Check it in Connected clubs before cancelling.",
  'result.cancelled': 'Booking cancelled at the club.',
  'result.cancelledUnlinked': 'Booking cancelled at the club and removed from {{count}} game(s).',
  'result.staysLinked': "It is still linked to {{count}} game(s) you can't edit.",
  'handoff.openClub': 'Open the club page',
} as const;

export type AgentCancelBookingI18nKey = keyof typeof AGENT_CANCEL_BOOKING_I18N_EN;
type Dictionary = Partial<Record<AgentCancelBookingI18nKey, string>>;

const ru: Dictionary = {
  'label.cancelBooking': 'Готовлю отмену бронирования',
  'preview.title': 'Отменить бронь в {{club}}',
  'field.unlinkFrom': 'Будет убрана из игры',
  'field.staysLinked': 'Останется в игре (вы не можете её менять)',
  'warn.cancelsAtClub':
    'Бронь отменяется в клубе из приложения на вашем телефоне. Действуют условия отмены клуба. Это нельзя отменить.',
  'warn.gamesKept': 'Связанные игры не отменяются, у них просто не будет этого корта.',
  'warn.shared': 'Эта бронь используется в {{count}} играх; все они лишатся корта.',
  'warn.staysLinked': 'Она останется в играх, которые вы не можете менять ({{count}}); попросите организатора убрать её.',
  'refuse.cancelViaClub': 'Эту бронь может отменить только клуб. Свяжитесь с {{club}}, чтобы отменить её.',
  'refuse.cancelViaClubPhone': 'Эту бронь может отменить только клуб. Позвоните в {{club}}: {{phone}}.',
  'error.notBooker': 'Отменить бронь может только тот, кто её сделал.',
  'error.alreadyCancelled': 'Эта бронь уже отменена.',
  'error.started': 'Эта бронь уже началась или прошла, её нельзя отменить.',
  'error.unknownState': 'Статус этой брони неясен. Проверьте его в «Подключённых клубах» перед отменой.',
  'result.cancelled': 'Бронь в клубе отменена.',
  'result.cancelledUnlinked': 'Бронь в клубе отменена и убрана из игр: {{count}}.',
  'result.staysLinked': 'Она всё ещё привязана к играм, которые вы не можете менять: {{count}}.',
  'handoff.openClub': 'Открыть страницу клуба',
};

const sr: Dictionary = {
  'label.cancelBooking': 'Pripremam otkazivanje rezervacije',
  'preview.title': 'Otkaži rezervaciju u {{club}}',
  'field.unlinkFrom': 'Biće uklonjena iz igre',
  'field.staysLinked': 'Ostaje povezana (ne možeš da je menjaš)',
  'warn.cancelsAtClub':
    'Rezervacija se otkazuje u klubu iz aplikacije na tvom telefonu. Važe uslovi otkazivanja kluba. Ovo ne može da se poništi.',
  'warn.gamesKept': 'Povezane igre se ne otkazuju, samo gube ovaj rezervisani teren.',
  'warn.shared': 'Ovu rezervaciju koristi {{count}} igara; sve gube teren.',
  'warn.staysLinked': 'Ostaje povezana sa igrama koje ne možeš da menjaš ({{count}}); zamoli organizatora da je ukloni.',
  'refuse.cancelViaClub': 'Ovu rezervaciju može da otkaže samo klub. Kontaktiraj {{club}} da je otkažeš.',
  'refuse.cancelViaClubPhone': 'Ovu rezervaciju može da otkaže samo klub. Pozovi {{club}} na {{phone}}.',
  'error.notBooker': 'Samo osoba koja je napravila rezervaciju može da je otkaže.',
  'error.alreadyCancelled': 'Ova rezervacija je već otkazana.',
  'error.started': 'Ova rezervacija je već počela ili je prošla, pa ne može da se otkaže.',
  'error.unknownState': 'Status ove rezervacije nije jasan. Proveri ga u Povezanim klubovima pre otkazivanja.',
  'result.cancelled': 'Rezervacija u klubu je otkazana.',
  'result.cancelledUnlinked': 'Rezervacija u klubu je otkazana i uklonjena iz igara: {{count}}.',
  'result.staysLinked': 'I dalje je povezana sa igrama koje ne možeš da menjaš: {{count}}.',
  'handoff.openClub': 'Otvori stranicu kluba',
};

const es: Dictionary = {
  'label.cancelBooking': 'Preparando la cancelación de la reserva',
  'preview.title': 'Cancelar la reserva en {{club}}',
  'field.unlinkFrom': 'Se quitará del partido',
  'field.staysLinked': 'Sigue vinculada (no puedes editarlo)',
  'warn.cancelsAtClub':
    'La reserva se cancela en el club desde la app de tu teléfono. Se aplican las condiciones de cancelación del club. No se puede deshacer.',
  'warn.gamesKept': 'Los partidos vinculados no se cancelan; solo pierden esta pista reservada.',
  'warn.shared': 'Esta reserva la usan {{count}} partidos; todos pierden la pista.',
  'warn.staysLinked': 'Sigue vinculada a {{count}} partido(s) que no puedes editar; pide a su organizador que la quite.',
  'refuse.cancelViaClub': 'Solo el club puede cancelar esta reserva. Contacta con {{club}} para cancelarla.',
  'refuse.cancelViaClubPhone': 'Solo el club puede cancelar esta reserva. Llama a {{club}} al {{phone}} para cancelarla.',
  'error.notBooker': 'Solo quien hizo esta reserva puede cancelarla.',
  'error.alreadyCancelled': 'Esta reserva ya está cancelada.',
  'error.started': 'Esta reserva ya ha empezado o ha terminado, así que no se puede cancelar.',
  'error.unknownState': 'El estado de esta reserva no está claro. Revísalo en Clubes conectados antes de cancelar.',
  'result.cancelled': 'Reserva cancelada en el club.',
  'result.cancelledUnlinked': 'Reserva cancelada en el club y quitada de {{count}} partido(s).',
  'result.staysLinked': 'Sigue vinculada a {{count}} partido(s) que no puedes editar.',
  'handoff.openClub': 'Abrir la página del club',
};

const cs: Dictionary = {
  'label.cancelBooking': 'Připravuji zrušení rezervace',
  'preview.title': 'Zrušit rezervaci v {{club}}',
  'field.unlinkFrom': 'Bude odebrána ze hry',
  'field.staysLinked': 'Zůstane připojená (nemůžeš ji upravit)',
  'warn.cancelsAtClub':
    'Rezervace se zruší v klubu z aplikace ve tvém telefonu. Platí storno podmínky klubu. Nelze to vrátit.',
  'warn.gamesKept': 'Propojené hry se neruší, jen přijdou o tento rezervovaný kurt.',
  'warn.shared': 'Tuto rezervaci používá {{count}} her; všechny přijdou o kurt.',
  'warn.staysLinked': 'Zůstane připojená k hrám, které nemůžeš upravit ({{count}}); požádej jejich pořadatele o odebrání.',
  'refuse.cancelViaClub': 'Tuto rezervaci může zrušit jen klub. Kontaktuj {{club}} a zruš ji.',
  'refuse.cancelViaClubPhone': 'Tuto rezervaci může zrušit jen klub. Zavolej do {{club}} na {{phone}}.',
  'error.notBooker': 'Zrušit ji může jen ten, kdo rezervaci vytvořil.',
  'error.alreadyCancelled': 'Tato rezervace je už zrušená.',
  'error.started': 'Tato rezervace už začala nebo skončila, nelze ji zrušit.',
  'error.unknownState': 'Stav této rezervace není jasný. Před zrušením ho zkontroluj v Připojených klubech.',
  'result.cancelled': 'Rezervace v klubu zrušena.',
  'result.cancelledUnlinked': 'Rezervace v klubu zrušena a odebrána z her: {{count}}.',
  'result.staysLinked': 'Je stále připojená k hrám, které nemůžeš upravit: {{count}}.',
  'handoff.openClub': 'Otevřít stránku klubu',
};

const ar: Dictionary = {
  'label.cancelBooking': 'جارٍ تحضير إلغاء الحجز',
  'preview.title': 'إلغاء الحجز في {{club}}',
  'field.unlinkFrom': 'ستتم إزالته من المباراة',
  'field.staysLinked': 'يبقى مرتبطًا (لا يمكنك تعديلها)',
  'warn.cancelsAtClub': 'يُلغى الحجز في النادي من التطبيق على هاتفك. تسري شروط الإلغاء لدى النادي. لا يمكن التراجع عن ذلك.',
  'warn.gamesKept': 'لا تُلغى المباريات المرتبطة؛ تفقد فقط هذا الملعب المحجوز.',
  'warn.shared': 'يستخدم هذا الحجز {{count}} مباريات؛ ستفقد جميعها الملعب.',
  'warn.staysLinked': 'يبقى مرتبطًا بمباريات لا يمكنك تعديلها ({{count}})؛ اطلب من منظمها إزالته.',
  'refuse.cancelViaClub': 'لا يمكن إلغاء هذا الحجز إلا عبر النادي. تواصل مع {{club}} لإلغائه.',
  'refuse.cancelViaClubPhone': 'لا يمكن إلغاء هذا الحجز إلا عبر النادي. اتصل بـ {{club}} على {{phone}} لإلغائه.',
  'error.notBooker': 'لا يمكن إلغاء هذا الحجز إلا لمن قام به.',
  'error.alreadyCancelled': 'هذا الحجز ملغى بالفعل.',
  'error.started': 'بدأ هذا الحجز أو انتهى، لذا لا يمكن إلغاؤه.',
  'error.unknownState': 'حالة هذا الحجز غير واضحة. تحقق منها في الأندية المتصلة قبل الإلغاء.',
  'result.cancelled': 'تم إلغاء الحجز في النادي.',
  'result.cancelledUnlinked': 'تم إلغاء الحجز في النادي وإزالته من المباريات: {{count}}.',
  'result.staysLinked': 'لا يزال مرتبطًا بمباريات لا يمكنك تعديلها: {{count}}.',
  'handoff.openClub': 'فتح صفحة النادي',
};

const zh: Dictionary = {
  'label.cancelBooking': '正在准备取消预订',
  'preview.title': '取消在 {{club}} 的预订',
  'field.unlinkFrom': '将从比赛中移除',
  'field.staysLinked': '仍保持关联（你无法编辑该比赛）',
  'warn.cancelsAtClub': '预订将通过你手机上的应用在俱乐部取消。适用俱乐部的取消条款。此操作无法撤销。',
  'warn.gamesKept': '关联的比赛不会取消，只会失去这个已预订的场地。',
  'warn.shared': '此预订被 {{count}} 场比赛使用；它们都会失去该场地。',
  'warn.staysLinked': '它仍关联到你无法编辑的比赛（{{count}}）；请让组织者移除。',
  'refuse.cancelViaClub': '此预订只能由俱乐部取消。请联系 {{club}} 取消。',
  'refuse.cancelViaClubPhone': '此预订只能由俱乐部取消。请致电 {{club}}：{{phone}}。',
  'error.notBooker': '只有预订人本人可以取消此预订。',
  'error.alreadyCancelled': '此预订已取消。',
  'error.started': '此预订已开始或已结束，无法取消。',
  'error.unknownState': '此预订的状态不明确。取消前请在“已连接的俱乐部”中查看。',
  'result.cancelled': '已在俱乐部取消预订。',
  'result.cancelledUnlinked': '已在俱乐部取消预订，并从比赛中移除：{{count}}。',
  'result.staysLinked': '它仍关联到你无法编辑的比赛：{{count}}。',
  'handoff.openClub': '打开俱乐部页面',
};

const id: Dictionary = {
  'label.cancelBooking': 'Menyiapkan pembatalan pemesanan',
  'preview.title': 'Batalkan pemesanan di {{club}}',
  'field.unlinkFrom': 'Akan dihapus dari permainan',
  'field.staysLinked': 'Tetap terhubung (kamu tidak bisa mengubahnya)',
  'warn.cancelsAtClub':
    'Reservasi dibatalkan di klub dari aplikasi di ponselmu. Ketentuan pembatalan klub berlaku. Ini tidak bisa dibatalkan.',
  'warn.gamesKept': 'Permainan yang terhubung tidak dibatalkan; hanya kehilangan lapangan yang dipesan ini.',
  'warn.shared': 'Pemesanan ini dipakai oleh {{count}} permainan; semuanya kehilangan lapangan.',
  'warn.staysLinked': 'Tetap terhubung ke permainan yang tidak bisa kamu ubah ({{count}}); minta penyelenggaranya menghapusnya.',
  'refuse.cancelViaClub': 'Hanya klub yang bisa membatalkan pemesanan ini. Hubungi {{club}} untuk membatalkannya.',
  'refuse.cancelViaClubPhone': 'Hanya klub yang bisa membatalkan pemesanan ini. Telepon {{club}} di {{phone}}.',
  'error.notBooker': 'Hanya orang yang membuat pemesanan ini yang bisa membatalkannya.',
  'error.alreadyCancelled': 'Pemesanan ini sudah dibatalkan.',
  'error.started': 'Pemesanan ini sudah dimulai atau selesai, jadi tidak bisa dibatalkan.',
  'error.unknownState': 'Status pemesanan ini tidak jelas. Periksa di Klub terhubung sebelum membatalkan.',
  'result.cancelled': 'Pemesanan dibatalkan di klub.',
  'result.cancelledUnlinked': 'Pemesanan dibatalkan di klub dan dihapus dari permainan: {{count}}.',
  'result.staysLinked': 'Masih terhubung ke permainan yang tidak bisa kamu ubah: {{count}}.',
  'handoff.openClub': 'Buka halaman klub',
};

const hi: Dictionary = {
  'label.cancelBooking': 'बुकिंग रद्द करने की तैयारी',
  'preview.title': '{{club}} में बुकिंग रद्द करें',
  'field.unlinkFrom': 'गेम से हटाई जाएगी',
  'field.staysLinked': 'जुड़ी रहेगी (आप इसे बदल नहीं सकते)',
  'warn.cancelsAtClub': 'आरक्षण आपके फ़ोन के ऐप से क्लब में रद्द होगा। क्लब की रद्द करने की शर्तें लागू होंगी। इसे वापस नहीं किया जा सकता।',
  'warn.gamesKept': 'जुड़े गेम रद्द नहीं होते; उनसे बस यह बुक किया कोर्ट हट जाता है।',
  'warn.shared': 'यह बुकिंग {{count}} गेम में इस्तेमाल होती है; सभी से कोर्ट हट जाएगा।',
  'warn.staysLinked': 'यह उन गेम से जुड़ी रहेगी जिन्हें आप बदल नहीं सकते ({{count}}); उनके आयोजक से हटाने को कहें।',
  'refuse.cancelViaClub': 'यह बुकिंग केवल क्लब रद्द कर सकता है। रद्द करने के लिए {{club}} से संपर्क करें।',
  'refuse.cancelViaClubPhone': 'यह बुकिंग केवल क्लब रद्द कर सकता है। {{club}} को {{phone}} पर कॉल करें।',
  'error.notBooker': 'यह बुकिंग केवल वही रद्द कर सकता है जिसने इसे किया।',
  'error.alreadyCancelled': 'यह बुकिंग पहले ही रद्द है।',
  'error.started': 'यह बुकिंग शुरू हो चुकी है या खत्म हो गई है, इसलिए रद्द नहीं हो सकती।',
  'error.unknownState': 'इस बुकिंग की स्थिति स्पष्ट नहीं है। रद्द करने से पहले कनेक्टेड क्लब में देखें।',
  'result.cancelled': 'क्लब में बुकिंग रद्द हो गई।',
  'result.cancelledUnlinked': 'क्लब में बुकिंग रद्द हुई और गेम से हटाई गई: {{count}}।',
  'result.staysLinked': 'यह अब भी उन गेम से जुड़ी है जिन्हें आप बदल नहीं सकते: {{count}}।',
  'handoff.openClub': 'क्लब पेज खोलें',
};

const th: Dictionary = {
  'label.cancelBooking': 'กำลังเตรียมยกเลิกการจอง',
  'preview.title': 'ยกเลิกการจองที่ {{club}}',
  'field.unlinkFrom': 'จะถูกนำออกจากเกม',
  'field.staysLinked': 'ยังเชื่อมอยู่ (คุณแก้ไขเกมนี้ไม่ได้)',
  'warn.cancelsAtClub': 'การจองจะถูกยกเลิกที่คลับผ่านแอปบนโทรศัพท์ของคุณ ใช้เงื่อนไขการยกเลิกของคลับ ย้อนกลับไม่ได้',
  'warn.gamesKept': 'เกมที่เชื่อมอยู่จะไม่ถูกยกเลิก เพียงแต่เสียคอร์ตที่จองนี้ไป',
  'warn.shared': 'การจองนี้ใช้ใน {{count}} เกม ทุกเกมจะเสียคอร์ตนี้',
  'warn.staysLinked': 'ยังเชื่อมกับเกมที่คุณแก้ไขไม่ได้ ({{count}}) โปรดขอให้ผู้จัดนำออก',
  'refuse.cancelViaClub': 'การจองนี้ยกเลิกได้โดยคลับเท่านั้น ติดต่อ {{club}} เพื่อยกเลิก',
  'refuse.cancelViaClubPhone': 'การจองนี้ยกเลิกได้โดยคลับเท่านั้น โทรหา {{club}} ที่ {{phone}}',
  'error.notBooker': 'เฉพาะผู้ที่ทำการจองเท่านั้นที่ยกเลิกได้',
  'error.alreadyCancelled': 'การจองนี้ถูกยกเลิกแล้ว',
  'error.started': 'การจองนี้เริ่มแล้วหรือสิ้นสุดแล้ว จึงยกเลิกไม่ได้',
  'error.unknownState': 'สถานะการจองนี้ไม่ชัดเจน โปรดตรวจสอบในคลับที่เชื่อมต่อก่อนยกเลิก',
  'result.cancelled': 'ยกเลิกการจองที่คลับแล้ว',
  'result.cancelledUnlinked': 'ยกเลิกการจองที่คลับแล้วและนำออกจากเกม: {{count}}',
  'result.staysLinked': 'ยังเชื่อมกับเกมที่คุณแก้ไขไม่ได้: {{count}}',
  'handoff.openClub': 'เปิดหน้าคลับ',
};

const ja: Dictionary = {
  'label.cancelBooking': '予約のキャンセルを準備中',
  'preview.title': '{{club}} の予約をキャンセル',
  'field.unlinkFrom': 'ゲームから外されます',
  'field.staysLinked': 'リンクされたまま（編集できないゲーム）',
  'warn.cancelsAtClub': '予約はスマートフォンのアプリからクラブでキャンセルされます。クラブのキャンセル規定が適用されます。元に戻せません。',
  'warn.gamesKept': 'リンクされたゲームはキャンセルされず、この予約コートがなくなるだけです。',
  'warn.shared': 'この予約は {{count}} 件のゲームで使われています。すべてのゲームでコートがなくなります。',
  'warn.staysLinked': '編集できないゲーム（{{count}}）にはリンクされたままです。主催者に外してもらってください。',
  'refuse.cancelViaClub': 'この予約はクラブのみキャンセルできます。{{club}} に連絡してキャンセルしてください。',
  'refuse.cancelViaClubPhone': 'この予約はクラブのみキャンセルできます。{{club}}（{{phone}}）に電話してください。',
  'error.notBooker': 'この予約をキャンセルできるのは予約した本人だけです。',
  'error.alreadyCancelled': 'この予約はすでにキャンセルされています。',
  'error.started': 'この予約はすでに始まっているか終了しているため、キャンセルできません。',
  'error.unknownState': 'この予約の状態が不明です。キャンセルする前に接続済みクラブで確認してください。',
  'result.cancelled': 'クラブの予約をキャンセルしました。',
  'result.cancelledUnlinked': 'クラブの予約をキャンセルし、ゲームから外しました: {{count}}。',
  'result.staysLinked': '編集できないゲームにはまだリンクされています: {{count}}。',
  'handoff.openClub': 'クラブページを開く',
};

export const AGENT_CANCEL_BOOKING_I18N_TRANSLATIONS: Record<string, Dictionary> = { ru, sr, es, cs, ar, zh, id, hi, th, ja };

export function agentCancelBookingT(
  locale: string | null | undefined,
  key: AgentCancelBookingI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template =
    AGENT_CANCEL_BOOKING_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_CANCEL_BOOKING_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
