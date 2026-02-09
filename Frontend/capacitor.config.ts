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
    allowMixedContent: false
  },
  plugins: {
    StatusBar: {
      style: 'light',
      overlaysWebView: true
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    }
  }
};

export default config;
