import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import * as axeMatchers from 'vitest-axe/matchers'
import { afterEach, expect } from 'vitest'

expect.extend(axeMatchers)

// axe-core pide un canvas a jsdom (para medir iconos) y jsdom avisa «Not implemented» en cada
// llamada. Devolver `null` es lo que axe espera cuando no hay canvas, y deja la salida limpia.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}

// jsdom no implementa `URL.createObjectURL`; las pruebas que necesitan URL distintas lo sustituyen con vi.spyOn.
if (typeof URL !== 'undefined' && typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:jsdom'
  URL.revokeObjectURL = () => undefined
}

// jsdom no reproduce video y avisa «Not implemented» en cada play()/pause(). Las pruebas que
// necesitan otro comportamiento lo sustituyen con vi.spyOn.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve()
  HTMLMediaElement.prototype.pause = () => undefined
}

afterEach(() => cleanup())
