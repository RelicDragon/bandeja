package com.funified.bandeja.widgets

data class CachedNextGameDto(
    val id: String,
    val title: String,
    val clubName: String?,
    val startTime: String,
    val status: String,
    val resultsStatus: String,
    val gameType: String,
    val participantCount: Int,
    val maxParticipants: Int?,
    val sport: String?,
    val playersPerMatch: Int?,
)

data class NextGamesEnvelope(
    val isAuthenticated: Boolean,
    val language: String,
    val games: List<CachedNextGameDto>,
) {
    companion object {
        @JvmStatic
        fun unauthenticated(language: String = "en"): NextGamesEnvelope {
            return NextGamesEnvelope(
                isAuthenticated = false,
                language = language.ifBlank { "en" },
                games = emptyList(),
            )
        }
    }
}
