import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.funified.bandeja',
  appName: 'Bandeja',
  webDir: 'dist',
  server: {
    url: 'http://localhost:3001',
  }
};

export default config;
