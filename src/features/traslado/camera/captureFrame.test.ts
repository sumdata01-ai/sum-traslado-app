// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapturaError, type CodigoCaptura, type ContextoLike, type LienzoLike, calcularDimensiones, capturarFrame } from './captureFrame'
import { CALIDAD_JPEG } from './config'

afterEach(() => vi.useRealTimers())

const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const jpeg = () => new Blob([BYTES], { type: 'image/jpeg' })

/** Un lienzo de mentira que recuerda con qué tamaño se dibujó y si se liberó. */
class FakeLienzo implements LienzoLike {
  width = 300
  height = 150
  anchoAlDibujar: number | null = null
  altoAlDibujar: number | null = null
  dibujos: unknown[][] = []
  pedidosDeBlob: Array<{ tipo?: string; calidad?: number }> = []

  contexto: ContextoLike | null = {
    drawImage: (...args: unknown[]) => {
      this.anchoAlDibujar = this.width
      this.altoAlDibujar = this.height
      this.dibujos.push(args)
    },
  }
  alDibujar: (() => void) | null = null
  alPedirBlob: (callback: (blob: Blob | null) => void) => void = (callback) => callback(jpeg())

  getContext(): ContextoLike | null {
    if (this.contexto && this.alDibujar) {
      const original = this.contexto
      return {
        drawImage: (...args) => {
          this.alDibujar?.()
          original.drawImage(...args)
        },
      }
    }
    return this.contexto
  }

  toBlob(callback: (blob: Blob | null) => void, tipo?: string, calidad?: number): void {
    this.pedidosDeBlob.push({ tipo, calidad })
    this.alPedirBlob(callback)
  }

  get liberado(): boolean {
    return this.width === 0 && this.height === 0
  }
}

const video = (videoWidth: number, videoHeight: number) => ({ videoWidth, videoHeight })

function capturar(frame = video(1280, 720), preparar: (lienzo: FakeLienzo) => void = () => undefined) {
  const lienzo = new FakeLienzo()
  preparar(lienzo)
  const crearLienzo = vi.fn(() => lienzo)
  const resultado = capturarFrame(frame, { crearLienzo, reloj: () => 1_700_000_000_000 })
  return { lienzo, crearLienzo, resultado }
}

function codigoDe(resultado: Awaited<ReturnType<typeof capturarFrame>>): CodigoCaptura | 'ok' {
  return resultado.ok ? 'ok' : resultado.error.codigo
}

describe('AC1 · una captura correcta', () => {
  it('devuelve un Blob JPEG con contenido, su tamaño y el instante medido', async () => {
    const { resultado } = capturar(video(1280, 720))
    const r = await resultado

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.foto.blob.type).toBe('image/jpeg')
    expect(r.foto.blob.size).toBeGreaterThan(0)
    expect(r.foto.ancho).toBe(1280)
    expect(r.foto.alto).toBe(720)
    expect(r.foto.creadaEn).toBe(1_700_000_000_000)
  })

  it('pide el JPEG con la calidad configurada y dibuja el video en el tamaño final', async () => {
    const frame = video(1280, 720)
    const { lienzo, resultado } = capturar(frame)
    await resultado

    expect(lienzo.pedidosDeBlob).toEqual([{ tipo: 'image/jpeg', calidad: CALIDAD_JPEG }])
    expect(lienzo.dibujos).toEqual([[frame, 0, 0, 1280, 720]])
  })

  it('el instante de la captura es el del momento de capturar, no uno fijo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T09:00:00Z'))
    const lienzo = new FakeLienzo()
    const r = await capturarFrame(video(640, 480), { crearLienzo: () => lienzo })
    expect(r.ok && r.foto.creadaEn).toBe(Date.parse('2026-10-09T09:00:00Z'))
  })
})

describe('AC4 · el lado largo no pasa de 1920 px', () => {
  it.each([
    ['apaisado 4000×3000', 4000, 3000, 1920, 1440],
    ['vertical 3000×4000', 3000, 4000, 1440, 1920],
    ['cuadrado 4000×4000', 4000, 4000, 1920, 1920],
    ['exacto 1920×1080', 1920, 1080, 1920, 1080],
    ['pequeño 1280×720: no se amplía', 1280, 720, 1280, 720],
    ['mínimo 1×1', 1, 1, 1, 1],
    ['muy alargado 8000×10', 8000, 10, 1920, 2],
  ] as const)('%s → %i×%i', async (_nombre, ancho, alto, anchoFinal, altoFinal) => {
    const { lienzo, resultado } = capturar(video(ancho, alto))
    const r = await resultado

    expect(lienzo.anchoAlDibujar).toBe(anchoFinal)
    expect(lienzo.altoAlDibujar).toBe(altoFinal)
    expect(r.ok && [r.foto.ancho, r.foto.alto]).toEqual([anchoFinal, altoFinal])
  })

  it('calcularDimensiones respeta otro límite y nunca devuelve 0', () => {
    expect(calcularDimensiones(4000, 3000, 1000)).toEqual({ ancho: 1000, alto: 750 })
    expect(calcularDimensiones(100_000, 1, 1920)).toEqual({ ancho: 1920, alto: 1 })
  })
})

describe('C7 · el video no está listo', () => {
  it.each([
    ['ancho 0', video(0, 720)],
    ['alto 0', video(1280, 0)],
    ['ambos 0', video(0, 0)],
    ['NaN', video(Number.NaN, Number.NaN)],
  ])('%s → VIDEO_NO_LISTO, y ni siquiera se crea el lienzo', async (_nombre, frame) => {
    const { crearLienzo, resultado } = capturar(frame)
    expect(codigoDe(await resultado)).toBe('VIDEO_NO_LISTO')
    expect(crearLienzo).not.toHaveBeenCalled()
  })
})

describe('C9 · Blob nulo o vacío', () => {
  it('toBlob devuelve null → BLOB_VACIO con «Vuelve a tomarla»', async () => {
    const { resultado } = capturar(video(1280, 720), (l) => (l.alPedirBlob = (cb) => cb(null)))
    const r = await resultado
    expect(codigoDe(r)).toBe('BLOB_VACIO')
    expect(!r.ok && r.error.message).toContain('Vuelve a tomarla')
  })

  it('un Blob de 0 bytes → BLOB_VACIO', async () => {
    const { resultado } = capturar(video(1280, 720), (l) => (l.alPedirBlob = (cb) => cb(new Blob([], { type: 'image/jpeg' }))))
    expect(codigoDe(await resultado)).toBe('BLOB_VACIO')
  })
})

describe('C10 · formato equivocado', () => {
  it.each([
    ['PNG (lo que devuelve toBlob si no soporta el tipo)', 'image/png'],
    ['WebP', 'image/webp'],
    ['sin tipo', ''],
  ])('%s → FORMATO_INCORRECTO', async (_nombre, tipo) => {
    const { resultado } = capturar(video(1280, 720), (l) => (l.alPedirBlob = (cb) => cb(new Blob([BYTES], { type: tipo }))))
    const r = await resultado
    expect(codigoDe(r)).toBe('FORMATO_INCORRECTO')
    expect(!r.ok && r.error.message).toContain('Vuelve a tomarla')
  })
})

describe('C11 · memoria y fallos del lienzo (AC5)', () => {
  it('una excepción de memoria al dibujar → MEMORIA_AGOTADA, sin lanzar, y el lienzo liberado', async () => {
    const { lienzo, resultado } = capturar(video(4000, 3000), (l) => {
      l.alDibujar = () => {
        throw new RangeError('Out of memory')
      }
    })
    const r = await resultado

    expect(codigoDe(r)).toBe('MEMORIA_AGOTADA')
    expect(!r.ok && r.error.message).toContain('memoria')
    expect(lienzo.liberado).toBe(true)
  })

  it('un QuotaExceededError también cuenta como falta de memoria', async () => {
    const { resultado } = capturar(video(1280, 720), (l) => {
      l.alDibujar = () => {
        throw new DOMException('cuota', 'QuotaExceededError')
      }
    })
    expect(codigoDe(await resultado)).toBe('MEMORIA_AGOTADA')
  })

  it('un lienzo sin contexto se toma como falta de memoria y también se libera', async () => {
    const { lienzo, resultado } = capturar(video(1280, 720), (l) => (l.contexto = null))
    expect(codigoDe(await resultado)).toBe('MEMORIA_AGOTADA')
    expect(lienzo.liberado).toBe(true)
  })

  it('otra excepción al dibujar → CAPTURA_FALLIDA, con el error original como causa', async () => {
    const original = new Error('algo raro')
    const { lienzo, resultado } = capturar(video(1280, 720), (l) => {
      l.alDibujar = () => {
        throw original
      }
    })
    const r = await resultado
    expect(codigoDe(r)).toBe('CAPTURA_FALLIDA')
    expect(!r.ok && r.error.cause).toBe(original)
    expect(lienzo.liberado).toBe(true)
  })

  it('si toBlob lanza de forma síncrona → se captura como fallo, sin romper', async () => {
    const { lienzo, resultado } = capturar(video(1280, 720), (l) => {
      l.alPedirBlob = () => {
        throw new Error('toBlob roto')
      }
    })
    expect(codigoDe(await resultado)).toBe('CAPTURA_FALLIDA')
    expect(lienzo.liberado).toBe(true)
  })

  it('si toBlob nunca responde, la captura no se cuelga: falla al agotarse el tiempo', async () => {
    vi.useFakeTimers()
    const lienzo = new FakeLienzo()
    lienzo.alPedirBlob = () => undefined // nunca llama de vuelta
    const pendiente = capturarFrame(video(1280, 720), { crearLienzo: () => lienzo, tiempoMaximoMs: 10_000 })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(codigoDe(await pendiente)).toBe('CAPTURA_FALLIDA')
    expect(lienzo.liberado).toBe(true)
  })

  it('el lienzo se libera siempre: tras un éxito, un Blob vacío o un formato equivocado', async () => {
    const exito = capturar()
    await exito.resultado
    expect(exito.lienzo.liberado).toBe(true)

    const vacio = capturar(video(1280, 720), (l) => (l.alPedirBlob = (cb) => cb(null)))
    await vacio.resultado
    expect(vacio.lienzo.liberado).toBe(true)

    const png = capturar(video(1280, 720), (l) => (l.alPedirBlob = (cb) => cb(new Blob([BYTES], { type: 'image/png' }))))
    await png.resultado
    expect(png.lienzo.liberado).toBe(true)
  })

  it('liberar el lienzo no daña el Blob ya entregado', async () => {
    const { lienzo, resultado } = capturar()
    const r = await resultado
    expect(lienzo.liberado).toBe(true)
    expect(r.ok && r.foto.blob.size).toBe(BYTES.length)
  })
})

describe('contrato general', () => {
  it('ningún fallo lanza una excepción: todos vuelven como resultado', async () => {
    const casos: Array<(l: FakeLienzo) => void> = [
      (l) => (l.contexto = null),
      (l) => (l.alPedirBlob = (cb) => cb(null)),
      (l) => (l.alPedirBlob = (cb) => cb(new Blob([BYTES], { type: 'image/png' }))),
      (l) => {
        l.alDibujar = () => {
          throw new RangeError('x')
        }
      },
      (l) => {
        l.alPedirBlob = () => {
          throw new Error('x')
        }
      },
    ]
    for (const preparar of casos) {
      const { resultado } = capturar(video(1280, 720), preparar)
      await expect(resultado).resolves.toMatchObject({ ok: false })
    }
  })

  it('todo error de captura se puede reintentar y trae un mensaje para el operario', () => {
    for (const codigo of ['VIDEO_NO_LISTO', 'BLOB_VACIO', 'FORMATO_INCORRECTO', 'MEMORIA_AGOTADA', 'CAPTURA_FALLIDA', 'INTERRUMPIDA'] as const) {
      const error = new CapturaError(codigo)
      expect(error.message.length).toBeGreaterThan(10)
      expect(error.message).toMatch(/[.]$/)
    }
  })
})
