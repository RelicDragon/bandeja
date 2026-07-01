import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineRollupSwcMinifyOption, viteMinify } from 'rollup-plugin-swc3'
import path from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

const appSemver = (() => {
  try {
    const raw = readFileSync(join(__dirname, 'package.json'), 'utf8')
    const v = JSON.parse(raw) as { version?: string }
    return process.env.VITE_APP_SEMVER || v.version || '0.0.0'
  } catch {
    return process.env.VITE_APP_SEMVER || '0.0.0'
  }
})()

const accessRefreshLeewayMs =
  Math.max(1, Number(process.env.VITE_ACCESS_REFRESH_LEEWAY_SECONDS || 120)) * 1000

const ensureWellKnown = () => {
  return {
    name: 'ensure-well-known',
    closeBundle() {
      const src = join(__dirname, 'public', '.well-known', 'apple-app-site-association')
      const dest = join(__dirname, 'dist', '.well-known', 'apple-app-site-association')
      
      if (existsSync(src)) {
        const destDir = join(__dirname, 'dist', '.well-known')
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true })
        }
        copyFileSync(src, dest)
      }
    },
  }
}

const swcMinify = defineRollupSwcMinifyOption({
  module: true,
  compress: {
    drop_console: true,
    drop_debugger: true,
  },
})

export default defineConfig(({ command }) => {
  const isDevServer = command === 'serve';
  const defaultApiBaseUrl = isDevServer ? 'http://localhost:3000/api' : 'https://bandeja.me/api';
  const defaultMediaBaseUrl = isDevServer ? 'http://localhost:3000' : 'https://bandeja.me';

  return {
  plugins: [react(), tailwindcss(), viteMinify(swcMinify), ensureWellKnown()],
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@bandeja/shared': path.resolve(__dirname, './shared'),
      '@backend': path.resolve(__dirname, '../Backend/src'),
      '@bandeja/chat-contract': path.resolve(__dirname, '../packages/chat-contract/src/index.ts'),
      '@bandeja/unread-contract': path.resolve(__dirname, '../packages/unread-contract/src/index.ts'),
    },
  },
  test: {
    server: {
      deps: {
        inline: ['@backend/sport/sportRegistry', '@bandeja/chat-contract', '@bandeja/unread-contract', '@bandeja/shared'],
      },
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io/': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
    // Reduce HMR polling to reduce requests
    hmr: {
      port: 3001,
    },
    // Enable host to allow external connections if needed
    host: true,
  },
  // Optimize build for production
  build: {
    // Disable source maps for production security
    sourcemap: false,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        const msg = 'message' in warning ? String((warning as { message: string }).message) : '';
        if (msg.includes('dynamic import will not move module into another chunk')) return;
        defaultHandler(warning);
      },
    },
    minify: false,
    // Ensure public directory is copied
    copyPublicDir: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(isDevServer ? 'development' : 'production'),
    'import.meta.env.VITE_MEDIA_BASE_URL': JSON.stringify(process.env.VITE_MEDIA_BASE_URL || defaultMediaBaseUrl),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || defaultApiBaseUrl),
    'import.meta.env.VITE_APP_SEMVER': JSON.stringify(appSemver),
    'import.meta.env.VITE_ACCESS_REFRESH_LEEWAY_MS': JSON.stringify(accessRefreshLeewayMs),
    'import.meta.env.VITE_MULTISPORT_6_SPORTS': JSON.stringify(process.env.VITE_MULTISPORT_6_SPORTS ?? ''),
    'import.meta.env.VITE_MULTISPORT_TENNIS': JSON.stringify(process.env.VITE_MULTISPORT_TENNIS ?? ''),
    'import.meta.env.VITE_MULTISPORT_POLISH': JSON.stringify(process.env.VITE_MULTISPORT_POLISH ?? ''),
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
};
})

