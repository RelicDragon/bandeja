import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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

export default defineConfig({
  plugins: [react(), ensureWellKnown()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
    // Minify for smaller bundles
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
    },
    // Ensure public directory is copied
    copyPublicDir: true,
  },
  define: {
    // Define environment variables with defaults
    'import.meta.env.VITE_MEDIA_BASE_URL': JSON.stringify(process.env.VITE_MEDIA_BASE_URL || 'http://localhost:3000'),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:3000/api'),
    'import.meta.env.VITE_APP_SEMVER': JSON.stringify(appSemver),
    'import.meta.env.VITE_ACCESS_REFRESH_LEEWAY_MS': JSON.stringify(accessRefreshLeewayMs),
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})

