/**
 * UI strings of the Phase 11 memory tools (`tools/memory.tools.ts`), in the 11 app
 * languages. English is the fallback. `sr` is Serbian Latin. Model-facing data stays English.
 */
import { agentLang } from './agentI18n';

export const AGENT_MEMORY_I18N_EN = {
  'label.listMemories': 'Checking memory',
  'label.readMemory': 'Recalling a memory',
  'label.saveMemory': 'Saving to memory',
  'label.forgetMemory': 'Forgetting a memory',
  'summary.memories': 'Memories: {{count}}',
  'summary.memoryRead': 'Recalled: {{description}}',
  'summary.memorySaved': 'Saved to memory: {{description}}',
  'summary.memoryUpdated': 'Memory updated: {{description}}',
  'summary.memoryForgotten': 'Forgotten: {{description}}',
} as const;

export type AgentMemoryI18nKey = keyof typeof AGENT_MEMORY_I18N_EN;
type Dictionary = Partial<Record<AgentMemoryI18nKey, string>>;

const ru: Dictionary = {
  'label.listMemories': 'Проверяю память',
  'label.readMemory': 'Вспоминаю',
  'label.saveMemory': 'Сохраняю в память',
  'label.forgetMemory': 'Забываю запись',
  'summary.memories': 'Записей в памяти: {{count}}',
  'summary.memoryRead': 'Вспомнил: {{description}}',
  'summary.memorySaved': 'Сохранено в память: {{description}}',
  'summary.memoryUpdated': 'Память обновлена: {{description}}',
  'summary.memoryForgotten': 'Забыто: {{description}}',
};

const sr: Dictionary = {
  'label.listMemories': 'Proveravam memoriju',
  'label.readMemory': 'Prisećam se',
  'label.saveMemory': 'Čuvam u memoriju',
  'label.forgetMemory': 'Zaboravljam zapis',
  'summary.memories': 'Zapisa u memoriji: {{count}}',
  'summary.memoryRead': 'Prisetio sam se: {{description}}',
  'summary.memorySaved': 'Sačuvano u memoriju: {{description}}',
  'summary.memoryUpdated': 'Memorija ažurirana: {{description}}',
  'summary.memoryForgotten': 'Zaboravljeno: {{description}}',
};

const es: Dictionary = {
  'label.listMemories': 'Revisando la memoria',
  'label.readMemory': 'Recordando',
  'label.saveMemory': 'Guardando en la memoria',
  'label.forgetMemory': 'Olvidando un recuerdo',
  'summary.memories': 'Recuerdos: {{count}}',
  'summary.memoryRead': 'Recordado: {{description}}',
  'summary.memorySaved': 'Guardado en la memoria: {{description}}',
  'summary.memoryUpdated': 'Memoria actualizada: {{description}}',
  'summary.memoryForgotten': 'Olvidado: {{description}}',
};

const cs: Dictionary = {
  'label.listMemories': 'Kontroluji paměť',
  'label.readMemory': 'Vybavuji si',
  'label.saveMemory': 'Ukládám do paměti',
  'label.forgetMemory': 'Zapomínám záznam',
  'summary.memories': 'Záznamů v paměti: {{count}}',
  'summary.memoryRead': 'Vybaveno: {{description}}',
  'summary.memorySaved': 'Uloženo do paměti: {{description}}',
  'summary.memoryUpdated': 'Paměť aktualizována: {{description}}',
  'summary.memoryForgotten': 'Zapomenuto: {{description}}',
};

const ar: Dictionary = {
  'label.listMemories': 'جارٍ التحقق من الذاكرة',
  'label.readMemory': 'جارٍ التذكّر',
  'label.saveMemory': 'جارٍ الحفظ في الذاكرة',
  'label.forgetMemory': 'جارٍ نسيان ملاحظة',
  'summary.memories': 'الملاحظات المحفوظة: {{count}}',
  'summary.memoryRead': 'تم التذكّر: {{description}}',
  'summary.memorySaved': 'تم الحفظ في الذاكرة: {{description}}',
  'summary.memoryUpdated': 'تم تحديث الذاكرة: {{description}}',
  'summary.memoryForgotten': 'تم النسيان: {{description}}',
};

const zh: Dictionary = {
  'label.listMemories': '正在查看记忆',
  'label.readMemory': '正在回想',
  'label.saveMemory': '正在保存到记忆',
  'label.forgetMemory': '正在删除一条记忆',
  'summary.memories': '记忆条数：{{count}}',
  'summary.memoryRead': '已回想：{{description}}',
  'summary.memorySaved': '已保存到记忆：{{description}}',
  'summary.memoryUpdated': '记忆已更新：{{description}}',
  'summary.memoryForgotten': '已忘记：{{description}}',
};

const id: Dictionary = {
  'label.listMemories': 'Memeriksa memori',
  'label.readMemory': 'Mengingat kembali',
  'label.saveMemory': 'Menyimpan ke memori',
  'label.forgetMemory': 'Melupakan catatan',
  'summary.memories': 'Catatan di memori: {{count}}',
  'summary.memoryRead': 'Diingat: {{description}}',
  'summary.memorySaved': 'Disimpan ke memori: {{description}}',
  'summary.memoryUpdated': 'Memori diperbarui: {{description}}',
  'summary.memoryForgotten': 'Dilupakan: {{description}}',
};

const hi: Dictionary = {
  'label.listMemories': 'मेमोरी देख रहा हूँ',
  'label.readMemory': 'याद कर रहा हूँ',
  'label.saveMemory': 'मेमोरी में सहेज रहा हूँ',
  'label.forgetMemory': 'एक नोट भूल रहा हूँ',
  'summary.memories': 'मेमोरी में नोट: {{count}}',
  'summary.memoryRead': 'याद किया: {{description}}',
  'summary.memorySaved': 'मेमोरी में सहेजा गया: {{description}}',
  'summary.memoryUpdated': 'मेमोरी अपडेट हुई: {{description}}',
  'summary.memoryForgotten': 'भुला दिया: {{description}}',
};

const th: Dictionary = {
  'label.listMemories': 'กำลังตรวจสอบความจำ',
  'label.readMemory': 'กำลังนึกถึง',
  'label.saveMemory': 'กำลังบันทึกลงความจำ',
  'label.forgetMemory': 'กำลังลบบันทึกความจำ',
  'summary.memories': 'บันทึกในความจำ: {{count}}',
  'summary.memoryRead': 'นึกออกแล้ว: {{description}}',
  'summary.memorySaved': 'บันทึกลงความจำแล้ว: {{description}}',
  'summary.memoryUpdated': 'อัปเดตความจำแล้ว: {{description}}',
  'summary.memoryForgotten': 'ลืมแล้ว: {{description}}',
};

const ja: Dictionary = {
  'label.listMemories': 'メモリーを確認しています',
  'label.readMemory': '思い出しています',
  'label.saveMemory': 'メモリーに保存しています',
  'label.forgetMemory': 'メモを削除しています',
  'summary.memories': 'メモリーの件数：{{count}}',
  'summary.memoryRead': '思い出しました：{{description}}',
  'summary.memorySaved': 'メモリーに保存しました：{{description}}',
  'summary.memoryUpdated': 'メモリーを更新しました：{{description}}',
  'summary.memoryForgotten': '削除しました：{{description}}',
};

export const AGENT_MEMORY_I18N_TRANSLATIONS: Record<string, Dictionary> = { ru, sr, es, cs, ar, zh, id, hi, th, ja };

export function agentMemoryT(
  locale: string | null | undefined,
  key: AgentMemoryI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template = AGENT_MEMORY_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_MEMORY_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
