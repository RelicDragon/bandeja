import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.funified.bandeja',
  appName: 'Bandeja',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Note: url is commented out to use bundled local files
    // This allows the app to work offline on initial launch
    // For development with live reload, uncomment: url: 'https://bandeja.me'
    cleartext: false
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile'
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#abdee3',
    minWebViewVersion: 60
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css'
    },
    StatusBar: {
      style: 'light',
      overlaysWebView: true
    },
    Keyboard: {
      resize: 'none',
      style: 'dark',
      // Android uses the app's JS/CSS keyboard lift. Letting the plugin resize
      // the WebView as well makes focused inputs jump by roughly 2x the keyboard.
      resizeOnFullScreen: false
    }
  }
};

export default config;
