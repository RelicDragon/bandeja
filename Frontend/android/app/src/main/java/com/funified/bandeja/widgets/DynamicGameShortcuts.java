package com.funified.bandeja.widgets;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import com.funified.bandeja.MainActivity;
import com.funified.bandeja.R;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Game-entity layer (#279): dynamic launcher / Assistant shortcuts for specific games.
 * Distinct from static feature shortcuts in shortcuts.xml (OPEN_APP_FEATURE → catalog URLs).
 * IDs use {@code dyn_game_*} — never reuse static shortcutIds from the feature layer.
 */
public final class DynamicGameShortcuts {
    private static final int MAX_DYNAMIC = 4;
    private static final String ID_PREFIX = "dyn_game_";

    private DynamicGameShortcuts() {}

    public static void syncFromEnvelope(Context context) {
        if (context == null) {
            return;
        }
        Context app = context.getApplicationContext();
        NextGamesEnvelope envelope = NextGamesEnvelopeStorage.read(app);
        List<CachedNextGameDto> games =
            envelope != null && envelope.isAuthenticated()
                ? envelope.getGames()
                : Collections.<CachedNextGameDto>emptyList();

        List<CachedNextGameDto> upcoming = NextGamePicker.listDisplayable(games);
        List<ShortcutInfoCompat> shortcuts = new ArrayList<>();
        int count = Math.min(MAX_DYNAMIC, upcoming.size());
        for (int i = 0; i < count; i++) {
            CachedNextGameDto game = upcoming.get(i);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setClass(app, MainActivity.class);
            intent.setData(Uri.parse(WidgetDeepLinks.game(game.getId())));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            String label = game.getTitle();
            if (label == null || label.trim().isEmpty()) {
                label = "Game";
            }
            if (label.length() > 40) {
                label = label.substring(0, 37) + "\u2026";
            }

            shortcuts.add(
                new ShortcutInfoCompat.Builder(app, ID_PREFIX + game.getId())
                    .setShortLabel(label)
                    .setLongLabel(label)
                    .setIcon(IconCompat.createWithResource(app, R.mipmap.ic_launcher))
                    .setIntent(intent)
                    .setRank(i)
                    .build()
            );
        }

        // Atomic replace — avoids empty window between removeAll + addDynamic.
        // Return ignored: launcher may deny under OEM quotas; next sync retries.
        ShortcutManagerCompat.setDynamicShortcuts(app, shortcuts);
    }
}
