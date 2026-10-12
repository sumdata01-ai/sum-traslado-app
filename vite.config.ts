import fs from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

// Dos modos de desarrollo:
//  - `npm run dev`        HTTP en localhost. Alcanza para la PC: el navegador trata `localhost`
//                         como contexto seguro, así que la cámara funciona sin certificado.
//  - `npm run dev:https`  HTTPS accesible desde la red, para probar con un teléfono: una IP de LAN
//                         por HTTP no es contexto seguro y el navegador bloquea la cámara.
//
// En el modo HTTPS se usa el certificado de mkcert (ver README) y, si no existe, uno autofirmado
// de @vitejs/plugin-basic-ssl: el teléfono no lo da por confiable y muestra una advertencia.
const CERT = path.resolve(import.meta.dirname, ".certs/dev.pem")
const KEY = path.resolve(import.meta.dirname, ".certs/dev-key.pem")
const hasMkcert = fs.existsSync(CERT) && fs.existsSync(KEY)

// Mismo origen para el navegador: sin CORS y con la cookie de refresh como "first-party".
// Es el equivalente en desarrollo del proxy nginx que se usará en producción (D2).
const BACKEND = process.env.VITE_PROXY_TARGET ?? "http://localhost:8050"
const proxy = {
  "/api": { target: BACKEND, changeOrigin: true },
  "/mobile": { target: BACKEND, changeOrigin: true },
}

export default defineConfig(async ({ mode }) => {
  const modoHttps = mode === "https"
  const https = modoHttps && hasMkcert ? { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) } : undefined
  // El plugin autofirmado solo se carga en modo HTTPS y sin mkcert.
  const ssl = modoHttps && !hasMkcert ? [(await import("@vitejs/plugin-basic-ssl")).default()] : []
  // Solo se abre a la red cuando hace falta probar con un teléfono: el proxy da acceso al
  // backend local a quien esté en la misma red.
  const host = modoHttps ? "0.0.0.0" : "localhost"

  return {
    plugins: [react(), tailwindcss(), ...ssl],
    server: {
      host,
      port: 5173,
      // Si el puerto está ocupado, fallar en vez de saltar a otro: la URL del teléfono no debe cambiar.
      strictPort: true,
      https,
      proxy,
    },
    preview: {
      host,
      port: 4174,
      strictPort: true,
      https,
      proxy,
    },
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "./src") },
    },
    build: { target: "es2022" },
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      // Las credenciales de prueba salen de `.env.local` (que git ignora). Solo se pasan las variables
      // `TRASLADO_*`, y solo a las pruebas: no entran al código que se publica (no llevan prefijo VITE_).
      env: loadEnv("test", import.meta.dirname, "TRASLADO_"),
      testTimeout: 15000,
      hookTimeout: 15000,
    },
  }
})
