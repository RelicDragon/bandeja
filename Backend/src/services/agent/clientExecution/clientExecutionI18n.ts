/**
 * Card lines of client-executed actions (booking plan §14.5), in the 11 app languages.
 * "Club bookings" is the app's name for `/profile/connected-clubs`. English is the fallback.
 */
import { agentLang } from '../i18n/agentI18n';

export const AGENT_CLIENT_EXEC_I18N_EN = {
  unknown: 'Outcome unknown — check Club bookings',
  connectedClubs: 'Club bookings',
  done: 'Done',
  partial: '{{done}} of {{planned}} done',
  nothing: "The club didn't accept it, nothing changed",
  postStepFailed: 'Done at the club, but the follow-up step failed',
  claimedElsewhere: 'Already running on another device',
  rolledBack: 'Not every court could be booked, so the booked ones were cancelled again. Nothing is booked',
  rollbackFailed: 'Not every court could be booked and undoing it failed: {{courts}} may still be booked — check Club bookings',
} as const;

type Key = keyof typeof AGENT_CLIENT_EXEC_I18N_EN;
type Dictionary = Record<Key, string>;

const TRANSLATIONS: Record<string, Dictionary> = {
  en: AGENT_CLIENT_EXEC_I18N_EN,
  ru: {
    unknown: 'Результат неизвестен — проверьте «Бронирования клубов»',
    connectedClubs: 'Бронирования клубов',
    done: 'Готово',
    partial: 'Выполнено {{done}} из {{planned}}',
    nothing: 'Клуб не принял запрос, ничего не изменилось',
    postStepFailed: 'В клубе выполнено, но следующий шаг не удался',
    claimedElsewhere: 'Уже выполняется на другом устройстве',
    rolledBack: 'Не все корты удалось забронировать, поэтому забронированные отменены. Ничего не забронировано',
    rollbackFailed: 'Не все корты удалось забронировать, и отмена не удалась: {{courts}} может быть ещё забронирован — проверьте «Бронирования клубов»',
  },
  sr: {
    unknown: 'Ishod nepoznat — proveri Rezervacije klubova',
    connectedClubs: 'Rezervacije klubova',
    done: 'Gotovo',
    partial: 'Urađeno {{done}} od {{planned}}',
    nothing: 'Klub nije prihvatio zahtev, ništa nije promenjeno',
    postStepFailed: 'Urađeno u klubu, ali sledeći korak nije uspeo',
    claimedElsewhere: 'Već se izvršava na drugom uređaju',
    rolledBack: 'Nisu svi tereni mogli da se rezervišu, pa su rezervisani otkazani. Ništa nije rezervisano',
    rollbackFailed: 'Nisu svi tereni mogli da se rezervišu, a otkazivanje nije uspelo: {{courts}} možda je još rezervisan — proveri Rezervacije klubova',
  },
  es: {
    unknown: 'Resultado desconocido: revisa Reservas de clubs',
    connectedClubs: 'Reservas de clubs',
    done: 'Hecho',
    partial: '{{done}} de {{planned}} hechos',
    nothing: 'El club no lo aceptó, no se cambió nada',
    postStepFailed: 'Hecho en el club, pero falló el paso siguiente',
    claimedElsewhere: 'Ya se está ejecutando en otro dispositivo',
    rolledBack: 'No se pudieron reservar todas las pistas, así que las reservadas se cancelaron. No hay nada reservado',
    rollbackFailed: 'No se pudieron reservar todas las pistas y deshacerlo falló: {{courts}} puede seguir reservada; revisa Reservas de clubs',
  },
  cs: {
    unknown: 'Výsledek neznámý — zkontrolujte Rezervace klubů',
    connectedClubs: 'Rezervace klubů',
    done: 'Hotovo',
    partial: 'Hotovo {{done}} z {{planned}}',
    nothing: 'Klub požadavek nepřijal, nic se nezměnilo',
    postStepFailed: 'V klubu hotovo, ale další krok selhal',
    claimedElsewhere: 'Už běží na jiném zařízení',
    rolledBack: 'Nepodařilo se rezervovat všechny kurty, takže rezervované byly zrušeny. Nic není rezervováno',
    rollbackFailed: 'Nepodařilo se rezervovat všechny kurty a zrušení selhalo: {{courts}} může být stále rezervován — zkontrolujte Rezervace klubů',
  },
  ar: {
    unknown: 'النتيجة غير معروفة — تحقّق من حجوزات النادي',
    connectedClubs: 'حجوزات النادي',
    done: 'تم',
    partial: 'تم {{done}} من {{planned}}',
    nothing: 'لم يقبل النادي الطلب، لم يتغير شيء',
    postStepFailed: 'تم في النادي، لكن فشلت الخطوة التالية',
    claimedElsewhere: 'قيد التنفيذ بالفعل على جهاز آخر',
    rolledBack: 'تعذّر حجز كل الملاعب، لذا أُلغيت الملاعب المحجوزة. لا يوجد أي حجز',
    rollbackFailed: 'تعذّر حجز كل الملاعب وفشل التراجع: قد يكون {{courts}} لا يزال محجوزًا — تحقّق من حجوزات النادي',
  },
  zh: {
    unknown: '结果未知——请查看“俱乐部预订”',
    connectedClubs: '俱乐部预订',
    done: '已完成',
    partial: '已完成 {{done}}/{{planned}}',
    nothing: '俱乐部未接受，未做任何更改',
    postStepFailed: '俱乐部端已完成，但后续步骤失败',
    claimedElsewhere: '已在另一台设备上执行',
    rolledBack: '未能预订全部场地，已预订的场地已取消。没有任何预订',
    rollbackFailed: '未能预订全部场地且撤销失败：{{courts}} 可能仍被预订——请查看“俱乐部预订”',
  },
  id: {
    unknown: 'Hasil tidak diketahui — cek Pemesanan klub',
    connectedClubs: 'Pemesanan klub',
    done: 'Selesai',
    partial: '{{done}} dari {{planned}} selesai',
    nothing: 'Klub tidak menerimanya, tidak ada yang berubah',
    postStepFailed: 'Selesai di klub, tetapi langkah berikutnya gagal',
    claimedElsewhere: 'Sedang berjalan di perangkat lain',
    rolledBack: 'Tidak semua lapangan bisa dipesan, jadi yang sudah dipesan dibatalkan lagi. Tidak ada yang dipesan',
    rollbackFailed: 'Tidak semua lapangan bisa dipesan dan pembatalannya gagal: {{courts}} mungkin masih dipesan — cek Pemesanan klub',
  },
  hi: {
    unknown: 'परिणाम अज्ञात — क्लब बुकिंग देखें',
    connectedClubs: 'क्लब बुकिंग',
    done: 'हो गया',
    partial: '{{planned}} में से {{done}} हो गए',
    nothing: 'क्लब ने स्वीकार नहीं किया, कुछ नहीं बदला',
    postStepFailed: 'क्लब में हो गया, लेकिन अगला चरण विफल रहा',
    claimedElsewhere: 'पहले से दूसरे डिवाइस पर चल रहा है',
    rolledBack: 'सभी कोर्ट बुक नहीं हो सके, इसलिए बुक किए गए कोर्ट रद्द कर दिए गए। कुछ भी बुक नहीं है',
    rollbackFailed: 'सभी कोर्ट बुक नहीं हो सके और रद्द करना विफल रहा: {{courts}} अभी भी बुक हो सकता है — क्लब बुकिंग देखें',
  },
  th: {
    unknown: 'ไม่ทราบผลลัพธ์ — ตรวจสอบที่ การจองคลับ',
    connectedClubs: 'การจองคลับ',
    done: 'เสร็จแล้ว',
    partial: 'เสร็จ {{done}} จาก {{planned}}',
    nothing: 'คลับไม่รับคำขอ ไม่มีอะไรเปลี่ยน',
    postStepFailed: 'ที่คลับเสร็จแล้ว แต่ขั้นตอนถัดไปล้มเหลว',
    claimedElsewhere: 'กำลังทำงานบนอุปกรณ์อื่นอยู่แล้ว',
    rolledBack: 'จองคอร์ตได้ไม่ครบ จึงยกเลิกคอร์ตที่จองไว้แล้ว ไม่มีการจองใดๆ',
    rollbackFailed: 'จองคอร์ตได้ไม่ครบและยกเลิกไม่สำเร็จ: {{courts}} อาจยังถูกจองอยู่ — ตรวจสอบที่ การจองคลับ',
  },
  ja: {
    unknown: '結果不明 — 「クラブ予約」を確認してください',
    connectedClubs: 'クラブ予約',
    done: '完了',
    partial: '{{planned}}件中{{done}}件完了',
    nothing: 'クラブに受け付けられず、何も変更されていません',
    postStepFailed: 'クラブ側では完了しましたが、次の手順に失敗しました',
    claimedElsewhere: '別の端末で実行中です',
    rolledBack: 'すべてのコートを予約できなかったため、予約済みのコートをキャンセルしました。何も予約されていません',
    rollbackFailed: 'すべてのコートを予約できず、取り消しにも失敗しました：{{courts}} はまだ予約されている可能性があります — 「クラブ予約」を確認してください',
  },
};

export function agentClientExecT(
  locale: string | null | undefined,
  key: Key,
  vars: Record<string, string | number> = {},
): string {
  const template = TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_CLIENT_EXEC_I18N_EN[key];
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
