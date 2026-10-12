import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// Las credenciales de prueba salen de `.env.local` (que git ignora) y solo se pasan a las pruebas.
Object.assign(process.env, loadEnv('test', import.meta.dirname, 'TRASLADO_'))

/**
 * Pruebas de extremo a extremo con los navegadores REALES instalados en la máquina (Chrome y Edge),
 * a través del servidor de Vite y contra el backend de la base de DESARROLLO. No descargan
 * navegadores: usan los instalados. Una sola a la vez: comparten la cuenta de prueba y el login
 * admite 10 por minuto.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', trace: 'off' },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
