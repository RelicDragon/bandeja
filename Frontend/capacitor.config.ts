import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.funified.bandeja',
  appName: 'Bandeja',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    url: 'https://bandeja.me',
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
    Keyboard: {
      resize: 'native',
      style: 'dark',
      resizeOnFullScreen: true
    },
    StatusBar: {
      style: 'dark',
      overlaysWebView: true
    }
  }
};

export default config;
