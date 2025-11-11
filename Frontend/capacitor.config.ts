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
    contentInset: 'automatic'
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
