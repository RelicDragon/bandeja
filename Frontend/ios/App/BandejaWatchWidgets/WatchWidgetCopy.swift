import Foundation
import BandejaNextGames

enum WatchWidgetCopy {
    nonisolated static func widgetLang() -> String {
        let fallback = Locale.current.language.languageCode?.identifier ?? "en"
        let raw = AppGroupStorage.suite?.string(forKey: AppGroupStorage.Keys.uiLanguage)
        let id: String
        if let r = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty {
            id = r
        } else {
            id = fallback
        }
        if id.hasPrefix("es") { return "es" }
        if id.hasPrefix("ru") { return "ru" }
        if id.hasPrefix("sr") { return "sr" }
        if id.hasPrefix("cs") { return "cs" }
        if id.hasPrefix("ar") { return "ar" }
        if id.hasPrefix("zh") { return "zh" }
        if id.hasPrefix("id") { return "id" }
        if id.hasPrefix("hi") { return "hi" }
        if id.hasPrefix("th") { return "th" }
        if id.hasPrefix("ja") { return "ja" }
        return "en"
    }

    nonisolated static func brand() -> String { "Bandeja" }

    nonisolated static func signInOnIPhone(_ lang: String) -> String {
        switch lang {
        case "es": return "Abre Bandeja en el iPhone para iniciar sesión."
        case "ru": return "Откройте Bandeja на iPhone для входа."
        case "sr": return "Отворите Bandeja на iPhone-у за пријаву."
        case "cs": return "Otevřete Bandeja na iPhonu a přihlaste se."
        case "ar": return "افتح Bandeja على iPhone لتسجيل الدخول."
        case "zh": return "请在 iPhone 上打开 Bandeja 以登录。"
        case "id": return "Buka Bandeja di iPhone untuk masuk."
        case "hi": return "साइन इन करने के लिए iPhone पर Bandeja खोलें।"
        case "th": return "เปิด Bandeja บน iPhone เพื่อเข้าสู่ระบบ"
        case "ja": return "サインインするには iPhone で Bandeja を開いてください。"
        default: return "Open Bandeja on your iPhone to sign in."
        }
    }

    nonisolated static func noUpcomingGames(_ lang: String) -> String {
        switch lang {
        case "es": return "No hay partidos próximos"
        case "ru": return "Нет предстоящих игр"
        case "sr": return "Нема предстојећих игара"
        case "cs": return "Žádné nadcházející zápasy"
        case "ar": return "لا توجد مباريات قادمة"
        case "zh": return "暂无即将开始的比赛"
        case "id": return "Tidak ada game mendatang"
        case "hi": return "कोई आगामी गेम नहीं"
        case "th": return "ไม่มีแมตช์ที่กำลังจะมาถึง"
        case "ja": return "予定の試合はありません"
        default: return "No upcoming games"
        }
    }

    nonisolated static func nextGameWidgetTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Próximo partido"
        case "ru": return "Следующая игра"
        case "sr": return "Следећа игра"
        case "cs": return "Další zápas"
        case "ar": return "المباراة التالية"
        case "zh": return "下一场比赛"
        case "id": return "Game berikutnya"
        case "hi": return "अगला गेम"
        case "th": return "แมตช์ถัดไป"
        case "ja": return "次の試合"
        default: return "Next Game"
        }
    }

    nonisolated static func nextGameWidgetDescription(_ lang: String) -> String {
        switch lang {
        case "es": return "Muestra tu próximo partido de pádel en Bandeja."
        case "ru": return "Показывает вашу следующую игру Bandeja."
        case "sr": return "Приказује вашу следећу Bandeja игру."
        case "cs": return "Zobrazí váš další zápas v Bandeja."
        case "ar": return "يعرض مباراتك التالية في Bandeja."
        case "zh": return "显示你的下一场 Bandeja 比赛。"
        case "id": return "Menampilkan game Bandeja berikutnya."
        case "hi": return "आपका अगला Bandeja गेम दिखाता है।"
        case "th": return "แสดงแมตช์ Bandeja ถัดไปของคุณ"
        case "ja": return "次のBandeja試合を表示します。"
        default: return "Shows your next Bandeja padel game."
        }
    }

    nonisolated static func now(_ lang: String) -> String {
        switch lang {
        case "es": return "Ahora"
        case "ru": return "Сейчас"
        case "sr": return "Сада"
        case "cs": return "Teď"
        case "ar": return "الآن"
        case "zh": return "现在"
        case "id": return "Sekarang"
        case "hi": return "अभी"
        case "th": return "ตอนนี้"
        case "ja": return "今"
        default: return "Now"
        }
    }

    nonisolated static func ended(_ lang: String) -> String {
        switch lang {
        case "es": return "Terminado"
        case "ru": return "Завершено"
        case "sr": return "Завршено"
        case "cs": return "Skončeno"
        case "ar": return "انتهت"
        case "zh": return "已结束"
        case "id": return "Selesai"
        case "hi": return "समाप्त"
        case "th": return "จบแล้ว"
        case "ja": return "終了"
        default: return "Ended"
        }
    }

    nonisolated static func placeholderGameTitle(_ lang: String) -> String {
        switch lang {
        case "es": return "Pádel"
        case "ru": return "Падель"
        case "sr": return "Падел"
        case "cs": return "Padel"
        case "ar": return "بادل"
        case "zh": return "板式网球"
        case "id": return "Padel"
        case "hi": return "पैडेल"
        case "th": return "ปาเดล"
        case "ja": return "パデル"
        default: return "Padel"
        }
    }

    nonisolated static func placeholderClub(_ lang: String) -> String {
        switch lang {
        case "es": return "Club"
        case "ru": return "Клуб"
        case "sr": return "Клуб"
        case "cs": return "Klub"
        case "ar": return "النادي"
        case "zh": return "俱乐部"
        case "id": return "Klub"
        case "hi": return "क्लब"
        case "th": return "คลับ"
        case "ja": return "クラブ"
        default: return "Club"
        }
    }

}
