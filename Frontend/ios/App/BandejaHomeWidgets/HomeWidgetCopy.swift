import Foundation
import BandejaNextGames

enum HomeWidgetCopy {
    nonisolated static func widgetLang(_ preferred: String? = nil) -> String {
        let fallback = Locale.current.language.languageCode?.identifier ?? "en"
        let raw = preferred
            ?? AppGroupStorage.suite?.string(forKey: AppGroupStorage.Keys.uiLanguage)
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

    nonisolated static func signIn(_ lang: String) -> String {
        switch lang {
        case "es": return "Inicia sesión para ver tu próximo partido"
        case "ru": return "Войдите, чтобы увидеть следующую игру"
        case "sr": return "Пријавите се да видите следећу игру"
        case "cs": return "Přihlaste se a uvidíte další zápas"
        case "ar": return "سجّل الدخول لرؤية مباراتك القادمة"
        case "zh": return "登录以查看下一场比赛"
        case "id": return "Masuk untuk melihat game berikutnya"
        case "hi": return "अगला गेम देखने के लिए साइन इन करें"
        case "th": return "เข้าสู่ระบบเพื่อดูแมตช์ถัดไป"
        case "ja": return "次の試合を見るにはサインインしてください"
        default: return "Sign in to see your next game"
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
        case "es": return "Muestra tu próximo partido en Bandeja."
        case "ru": return "Показывает вашу следующую игру Bandeja."
        case "sr": return "Приказује вашу следећу Bandeja игру."
        case "cs": return "Zobrazí váš další zápas v Bandeja."
        case "ar": return "يعرض مباراتك التالية في Bandeja."
        case "zh": return "显示你的下一场 Bandeja 比赛。"
        case "id": return "Menampilkan game Bandeja berikutnya."
        case "hi": return "आपका अगला Bandeja गेम दिखाता है।"
        case "th": return "แสดงแมตช์ Bandeja ถัดไปของคุณ"
        case "ja": return "次のBandeja試合を表示します。"
        default: return "Shows your next Bandeja game."
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

    nonisolated static func players(_ count: Int, max: Int?, lang: String) -> String {
        if let max, max > 0 {
            return "\(count)/\(max)"
        }
        return "\(count)"
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
