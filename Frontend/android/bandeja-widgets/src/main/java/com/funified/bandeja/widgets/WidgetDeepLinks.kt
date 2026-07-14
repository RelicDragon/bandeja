package com.funified.bandeja.widgets

/** Widget HTTPS targets — keep equal to Frontend/src/deepLinks/catalog.mirror.json (#278). */
object WidgetDeepLinks {
    const val HOME = "https://bandeja.me/"
    const val LOGIN = "https://bandeja.me/login"
    const val NEXT_GAME = "https://bandeja.me/next-game"
    const val NEXT_GAME_CHAT = "https://bandeja.me/next-game?open=chat"
    const val NEXT_GAME_LIVE = "https://bandeja.me/next-game?open=live"

    @JvmStatic
    fun game(id: String): String = "https://bandeja.me/games/$id"

    @JvmStatic
    fun gameChat(id: String): String = "https://bandeja.me/games/$id/chat"

    @JvmStatic
    fun gameLive(id: String): String = "https://bandeja.me/games/$id/live"
}
