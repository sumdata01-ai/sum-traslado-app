import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// El dominio es puro: ni React, ni el navegador, ni las capas de arriba.
// Ver docs/02-arquitectura/arquitectura-front.md §3 (principio 7) y docs/07-planificacion/backlog.md F-01 AC4.
const DOMINIO = 'src/features/**/domain/**/*.{ts,tsx}'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results', '.certs']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js', 'playwright.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: [DOMINIO],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'react-router',
                'react-router-dom',
                'dexie',
                'dexie-react-hooks',
                '@tanstack/*',
              ],
              message: 'El dominio es puro: no importa React, el router, Dexie ni TanStack Query.',
            },
            {
              group: [
                '@/app/*',
                '@/core/*',
                '@/features/*/data/*',
                '@/features/*/api/*',
                '@/features/*/sync/*',
                '@/features/*/camera/*',
                '@/features/*/pages/*',
                '@/features/*/components/*',
              ],
              message: 'El dominio no depende de las capas superiores.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
          name,
          message: 'El dominio es puro: no toca el navegador.',
        })),
      ],
    },
  },
])
