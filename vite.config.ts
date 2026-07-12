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
  server: {
    watch: {
      ignored: [
        '**/.wwebjs_auth/**',
        '**/.wwebjs_cache/**',
        '**/whatsapp-qr.png'
      ]
    }
  }
})
