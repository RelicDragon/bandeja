import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
    },
    // Reduce HMR polling to reduce requests
    hmr: {
      port: 3001,
    },
    // Enable host to allow external connections if needed
    host: true,
  },
  // Optimize build for development
  build: {
    // Enable source maps for debugging
    sourcemap: true,
    // Reduce chunk size warnings
    chunkSizeWarningLimit: 1000,
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

