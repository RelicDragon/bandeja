import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

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
      '/character': {
        target: 'http://localhost:4950',
        changeOrigin: true,
        rewrite: (path) => path,
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
    // Reduce chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Minify for smaller bundles
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
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
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})

