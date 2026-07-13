import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Browser-like environment (IndexedDB, WebCrypto, localStorage, etc.)
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // सिर्फ src/ फ़ाइलें count करें (electron/ और tests/ नहीं)
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/main.tsx',       // Entry point — UI boilerplate, test नहीं होता
        'src/index.css',
        'src/**/*.d.ts',
        'src/supabase.ts',    // External config — test नहीं होता
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify('test'),
    'import.meta.env.DEV': JSON.stringify(false),
    'import.meta.env.PROD': JSON.stringify(false),
  },
});
