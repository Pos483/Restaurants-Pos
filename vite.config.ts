import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Important for electron builds
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version)
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-sentry':   ['@sentry/react'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-dexie':    ['dexie'],
          'vendor-lucide':   ['lucide-react'],
        }
      }
    }
  },
  server: {
    watch: {
      ignored: [
        '**/.wwebjs_auth/**',
        '**/.wwebjs_cache/**',
        '**/whatsapp-qr.png',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/e2e/.auth/**',
      ]
    }
  }
})
