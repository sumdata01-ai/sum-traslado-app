// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

function leer(patron: RegExp): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const [, nombre, valor] of css.matchAll(patron)) {
    if (nombre && valor) mapa.set(nombre, valor.toLowerCase())
  }
  return mapa
}

const colores = leer(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)
const radios = leer(/--radius-([a-z0-9-]+):\s*(\d+px)\s*;/g)

// docs/01-vision-y-alcance/patron-traslado-web.md §5 (app_colors.dart): nombre en la web ← nombre en la app.
const TABLA_DEL_PATRON: ReadonlyArray<readonly [string, string, string]> = [
  ['primary', 'primary', '#1F4F8E'],
  ['primary-deep', 'primaryDeep', '#0F2A5E'],
  ['primary-soft', 'primarySoft', '#EAF2FF'],
  ['page', 'bg', '#F1F5F9'],
  ['surface', 'surface', '#FFFFFF'],
  ['surface-2', 'surface2', '#F8FAFC'],
  ['line', 'border', '#E5E7EB'],
  ['line-strong', 'borderStrong', '#CBD5E1'],
  ['ink-1', 'text1', '#0F172A'],
  ['ink-2', 'text2', '#334155'],
  ['ink-3', 'text3', '#64748B'],
  ['ink-muted', 'textMuted', '#94A3B8'],
  ['success', 'success', '#16A34A'],
  ['success-soft', 'successSoft', '#DCFCE7'],
  ['success-ink', 'successInk', '#15803D'],
  ['warning', 'warning', '#F59E0B'],
  ['warning-soft', 'warningSoft', '#FEF3C7'],
  ['warning-ink', 'warningInk', '#B45309'],
  ['danger', 'danger', '#E11D48'],
  ['danger-soft', 'dangerSoft', '#FFF1F2'],
  ['danger-ink', 'dangerInk', '#9F1239'],
  ['info', 'info', '#1E3A8A'],
  ['info-soft', 'infoSoft', '#EFF6FF'],
]

describe('tokens frente a la tabla del patrón', () => {
  it.each(TABLA_DEL_PATRON)('--color-%s es el %s de la app: %s', (token, _nombreEnLaApp, hex) => {
    expect(colores.get(token)).toBe(hex.toLowerCase())
  })

  it('no hay colores de más: solo los de la tabla', () => {
    expect([...colores.keys()].sort()).toEqual(TABLA_DEL_PATRON.map(([token]) => token).sort())
  })

  it('los radios son 12 (ficha), 14 (control), 18 (card) y 30 (chip)', () => {
    expect(Object.fromEntries(radios)).toEqual({ ficha: '12px', control: '14px', card: '18px', chip: '30px' })
  })

  it('la paleta por defecto de Tailwind está desactivada', () => {
    expect(css).toContain('--color-*: initial;')
  })
})

// --- Contraste (WCAG 2.1) -------------------------------------------------------------------
// vitest-axe no puede medir contraste en jsdom (no hay estilos calculados), así que se mide aquí
// sobre los valores reales de los tokens.

function luminancia(hex: string): number {
  const canal = (desde: number) => {
    const c = Number.parseInt(hex.slice(desde, desde + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

function contraste(texto: string, fondo: string): number {
  const t = colores.get(texto)
  const f = colores.get(fondo)
  if (!t || !f) throw new Error(`Token inexistente: ${texto} o ${fondo}`)
  const [claro, oscuro] = [luminancia(t), luminancia(f)].sort((a, b) => b - a) as [number, number]
  return (claro + 0.05) / (oscuro + 0.05)
}

describe('contraste de los pares que usan los componentes', () => {
  // Texto normal: 4,5:1 como mínimo.
  it.each([
    ['surface', 'primary', 'texto del botón primario'],
    ['surface', 'danger', 'texto del botón de peligro'],
    ['primary', 'surface', 'texto del botón secundario'],
    ['primary', 'primary-soft', 'botón secundario al pasar el cursor'],
    ['ink-1', 'page', 'cuerpo sobre el fondo'],
    ['ink-1', 'surface', 'cuerpo sobre una tarjeta'],
    ['ink-2', 'page', 'encabezado de sección sobre el fondo'],
    ['ink-2', 'line', 'contador en píldora'],
    ['ink-3', 'surface', 'etiqueta del contador de avance (11 px)'],
    ['success-ink', 'success-soft', 'banner de listo'],
    ['warning-ink', 'warning-soft', 'banner sin conexión'],
    ['danger-ink', 'danger-soft', 'banner de error'],
    ['info', 'info-soft', 'banner informativo'],
  ])('%s sobre %s llega a 4,5:1 (%s)', (texto, fondo) => {
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5)
  })

  // Texto grande (28 px en negrita): 3:1.
  it.each([
    ['success', 'surface', 'número de «enviados»'],
    ['warning-ink', 'surface', 'número de «por enviar»'],
    ['ink-3', 'surface', 'número de «sin empezar»'],
  ])('%s sobre %s llega a 3:1 (%s)', (texto, fondo) => {
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(3)
  })
})
