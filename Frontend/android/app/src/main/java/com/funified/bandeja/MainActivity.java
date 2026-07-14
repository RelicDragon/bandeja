package com.funified.bandeja;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsetsController;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.funified.bandeja.auth.AuthBridgePlugin;
import com.funified.bandeja.auth.BrandingLogoStorage;
import com.funified.bandeja.widgets.WidgetBridgePlugin;
import com.funified.bandeja.push.ChatNotificationHelper;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    protected void attachBaseContext(Context newBase) {
        Context context = newBase;
        if (newBase != null) {
            Configuration configuration = newBase.getResources().getConfiguration();
            if (configuration.fontScale > 1.2f) {
                Configuration newConfiguration = new Configuration(configuration);
                newConfiguration.fontScale = 1.2f;
                context = newBase.createConfigurationContext(newConfiguration);
            }
        }
        super.attachBaseContext(context);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuthBridgePlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        applyBrandingLaunchTheme();
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !AuthBridgePlugin.isAppShellReady());
        super.onCreate(savedInstanceState);
        ChatNotificationHelper.ensureChannel(this);
        
        // Enable edge-to-edge display for safe area insets
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ (API 30+)
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController insetsController = getWindow().getInsetsController();
            if (insetsController != null) {
                insetsController.setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                );
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // Android 5.0+ (API 21+)
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
            getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
            getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        }
    }

    private void resetContentChildToMatchParent() {
        View content = findViewById(android.R.id.content);
        if (content == null || !(content instanceof ViewGroup)) {
            return;
        }
        ViewGroup group = (ViewGroup) content;
        if (group.getChildCount() == 0) {
            return;
        }
        View child = group.getChildAt(0);
        ViewGroup.LayoutParams lp = child.getLayoutParams();
        if (lp == null) {
            return;
        }
        if (lp.height != ViewGroup.LayoutParams.MATCH_PARENT) {
            lp.height = ViewGroup.LayoutParams.MATCH_PARENT;
            child.setLayoutParams(lp);
            child.requestLayout();
        }
    }

    private void reapplyInsetsAfterFocus() {
        resetContentChildToMatchParent();
        View decor = getWindow() != null ? getWindow().getDecorView() : null;
        if (decor != null) {
            ViewCompat.requestApplyInsets(decor);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            View decor = getWindow() != null ? getWindow().getDecorView() : null;
            if (decor != null) {
                decor.post(this::reapplyInsetsAfterFocus);
            } else {
                reapplyInsetsAfterFocus();
            }
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    private void applyBrandingLaunchTheme() {
        switch (BrandingLogoStorage.getLogoKey(this)) {
            case "tennis":
                setTheme(R.style.AppTheme_NoActionBarLaunch_Tennis);
                return;
            case "pickleball":
                setTheme(R.style.AppTheme_NoActionBarLaunch_Pickleball);
                return;
            case "badminton":
                setTheme(R.style.AppTheme_NoActionBarLaunch_Badminton);
                return;
            case "table_tennis":
                setTheme(R.style.AppTheme_NoActionBarLaunch_TableTennis);
                return;
            case "squash":
                setTheme(R.style.AppTheme_NoActionBarLaunch_Squash);
                return;
            case "racket":
                setTheme(R.style.AppTheme_NoActionBarLaunch_Racket);
                return;
            default:
                return;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (getBridge() != null
                && requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode <= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle handle = getBridge().getPlugin("SocialLogin");
            if (handle != null && handle.getInstance() instanceof SocialLoginPlugin) {
                Intent intentToForward = data != null ? data : new Intent();
                ((SocialLoginPlugin) handle.getInstance()).handleGoogleLoginIntent(requestCode, intentToForward);
            }
        }
        super.onActivityResult(requestCode, resultCode, data);
    }
}
