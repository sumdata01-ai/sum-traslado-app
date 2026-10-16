// @vitest-environment node
/** O-05 · el lector de códigos: cuadro a cuadro, una lectura, y sin dejar nada colgado. */
import { ChecksumException, FormatException, IllegalStateException, NotFoundException } from '@zxing/library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DecodificadorCodigos, EscanerCodigos, INTERVALO_ESCANEO_MS, LADO_LARGO_ESCANEO_PX, crearDecodificadorZxing } from './escaneo'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

class FakeLienzo {
  width = 0
  height = 0
  dibujos: Array<{ fuente: unknown; ancho: number; alto: number }> = []
  contexto: { drawImage: (fuente: unknown, x: number, y: number, ancho: number, alto: number) => void } | null = {
    drawImage: (fuente, _x, _y, ancho, alto) => void this.dibujos.push({ fuente, ancho, alto }),
  }
  pedidos: unknown[] = []
  getContext(_tipo: string, opciones?: unknown) {
    this.pedidos.push(opciones)
    return this.contexto
  }
}

function montar(opciones: { video?: { videoWidth: number; videoHeight: number }; respuestas?: Array<string | null | Error> } = {}) {
  const video = opciones.video ?? { videoWidth: 1920, videoHeight: 1080 }
  const respuestas = [...(opciones.respuestas ?? [])]
  const decodificar = vi.fn((): string | null => {
    const r = respuestas.length > 0 ? respuestas.shift()! : null
    if (r instanceof Error) throw r
    return r
  })
  const decodificador: DecodificadorCodigos = { decodificar }
  const lienzo = new FakeLienzo()
  const alLeer = vi.fn()
  const alFallar = vi.fn()
  const escaner = new EscanerCodigos({ video, decodificador, alLeer, alFallar, crearLienzo: () => lienzo as unknown as HTMLCanvasElement })
  return { escaner, decodificar, lienzo, alLeer, alFallar, video }
}

const avanzar = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('leer un código', () => {
  it('entrega el texto del primer código leído, una sola vez, y se detiene solo', async () => {
    const m = montar({ respuestas: [null, null, 'LSCABN3E2VE840638', 'OTRO'] })
    m.escaner.iniciar()

    await avanzar(5_000)

    expect(m.alLeer).toHaveBeenCalledTimes(1)
    expect(m.alLeer).toHaveBeenCalledWith('LSCABN3E2VE840638')
    expect(m.decodificar).toHaveBeenCalledTimes(3) // no sigue leyendo después de encontrar
    expect(m.escaner.activo).toBe(false)
  })

  it('un cuadro sin código no es un fallo: sigue mirando', async () => {
    const m = montar({ respuestas: [null, null, null] })
    m.escaner.iniciar()
    await avanzar(INTERVALO_ESCANEO_MS * 5)
    expect(m.decodificar.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(m.alLeer).not.toHaveBeenCalled()
    expect(m.alFallar).not.toHaveBeenCalled()
    expect(m.escaner.activo).toBe(true)
  })

  it('un texto vacío o de solo espacios se ignora', async () => {
    const m = montar({ respuestas: ['', '   ', 'ABC'] })
    m.escaner.iniciar()
    await avanzar(2_000)
    expect(m.alLeer).toHaveBeenCalledTimes(1)
    expect(m.alLeer).toHaveBeenCalledWith('ABC')
  })

  it('espera el intervalo entre un cuadro y el siguiente', async () => {
    const m = montar()
    m.escaner.iniciar()
    await avanzar(0)
    expect(m.decodificar).toHaveBeenCalledTimes(1)
    await avanzar(INTERVALO_ESCANEO_MS - 1)
    expect(m.decodificar).toHaveBeenCalledTimes(1)
    await avanzar(1)
    expect(m.decodificar).toHaveBeenCalledTimes(2)
  })

  it('con el video sin imagen todavía (0×0) no analiza nada', async () => {
    const m = montar({ video: { videoWidth: 0, videoHeight: 0 } })
    m.escaner.iniciar()
    await avanzar(1_000)
    expect(m.decodificar).not.toHaveBeenCalled()
    expect(m.escaner.activo).toBe(true)
  })

  it('empieza a analizar cuando el video ya tiene imagen', async () => {
    const m = montar({ video: { videoWidth: 0, videoHeight: 0 } })
    m.escaner.iniciar()
    await avanzar(500)
    Object.assign(m.video, { videoWidth: 1280, videoHeight: 720 })
    await avanzar(500)
    expect(m.decodificar).toHaveBeenCalled()
  })
})

describe('el cuadro que se analiza', () => {
  it('se reduce al lado largo máximo, conservando la proporción', async () => {
    const m = montar({ video: { videoWidth: 3840, videoHeight: 2160 } })
    m.escaner.iniciar()
    await avanzar(0)
    expect(m.lienzo.dibujos[0]).toMatchObject({ ancho: LADO_LARGO_ESCANEO_PX, alto: 576 })
  })

  it('un cuadro pequeño no se amplía', async () => {
    const m = montar({ video: { videoWidth: 640, videoHeight: 480 } })
    m.escaner.iniciar()
    await avanzar(0)
    expect(m.lienzo.dibujos[0]).toMatchObject({ ancho: 640, alto: 480 })
  })

  it('dibuja el video, no otra cosa, y pide el contexto pensado para leer píxeles seguido', async () => {
    const m = montar()
    m.escaner.iniciar()
    await avanzar(0)
    expect(m.lienzo.dibujos[0]?.fuente).toBe(m.video)
    expect(m.lienzo.pedidos[0]).toEqual({ willReadFrequently: true })
  })

  it('reutiliza un solo lienzo en todos los cuadros', async () => {
    const crearLienzo = vi.fn(() => new FakeLienzo() as unknown as HTMLCanvasElement)
    const escaner = new EscanerCodigos({
      video: { videoWidth: 1280, videoHeight: 720 },
      decodificador: { decodificar: () => null },
      alLeer: () => undefined,
      crearLienzo,
    })
    escaner.iniciar()
    await avanzar(2_000)
    expect(crearLienzo).toHaveBeenCalledTimes(1)
    escaner.detener()
  })
})

describe('detener y no dejar nada colgado', () => {
  it('detener() para la lectura aunque haya un cuadro pendiente', async () => {
    const m = montar({ respuestas: [null, 'TARDE'] })
    m.escaner.iniciar()
    await avanzar(0)
    m.escaner.detener()
    await avanzar(5_000)
    expect(m.alLeer).not.toHaveBeenCalled()
    expect(m.decodificar).toHaveBeenCalledTimes(1)
  })

  it('suelta el lienzo al detenerse, también tras leer un código', async () => {
    const m = montar({ respuestas: ['ABC'] })
    m.escaner.iniciar()
    await avanzar(0)
    expect(m.lienzo.width).toBe(0)
    expect(m.lienzo.height).toBe(0)
  })

  it('detener() varias veces o antes de iniciar no falla', () => {
    const m = montar()
    expect(() => {
      m.escaner.detener()
      m.escaner.detener()
    }).not.toThrow()
  })

  it('iniciar() dos veces no crea dos lecturas en paralelo', async () => {
    const m = montar()
    m.escaner.iniciar()
    m.escaner.iniciar()
    await avanzar(0)
    expect(m.decodificar).toHaveBeenCalledTimes(1)
  })

  it('después de detener se puede volver a iniciar', async () => {
    const m = montar({ respuestas: [null, null, 'DE NUEVO'] })
    m.escaner.iniciar()
    await avanzar(0)
    m.escaner.detener()
    m.escaner.iniciar()
    await avanzar(1_000)
    expect(m.alLeer).toHaveBeenCalledWith('DE NUEVO')
  })
})

describe('cuando el decodificador falla de verdad', () => {
  it('se detiene y avisa con el error, sin lanzar', async () => {
    const error = new Error('el decodificador se rompió')
    const m = montar({ respuestas: [error] })
    m.escaner.iniciar()

    await avanzar(1_000)

    expect(m.alFallar).toHaveBeenCalledTimes(1)
    expect(m.alFallar).toHaveBeenCalledWith(error)
    expect(m.escaner.activo).toBe(false)
    expect(m.decodificar).toHaveBeenCalledTimes(1)
  })

  it('un lienzo sin contexto también es un fallo avisado', async () => {
    const m = montar()
    m.lienzo.contexto = null
    m.escaner.iniciar()
    await avanzar(500)
    expect(m.alFallar).toHaveBeenCalledTimes(1)
    expect(m.escaner.activo).toBe(false)
  })

  it('sin alFallar tampoco lanza', async () => {
    const escaner = new EscanerCodigos({
      video: { videoWidth: 1280, videoHeight: 720 },
      decodificador: {
        decodificar: () => {
          throw new Error('x')
        },
      },
      alLeer: () => undefined,
      crearLienzo: () => new FakeLienzo() as unknown as HTMLCanvasElement,
    })
    escaner.iniciar()
    await expect(avanzar(1_000)).resolves.not.toThrow()
    expect(escaner.activo).toBe(false)
  })
})

describe('el decodificador de zxing', () => {
  /** Un lector de mentira que recuerda con qué pistas se creó y responde lo que se le diga. */
  const lectores: Array<{ pistas: Map<number, unknown>; respuesta: () => { getText: () => string } }> = []

  afterEach(() => {
    lectores.length = 0
    vi.doUnmock('@zxing/browser')
    vi.resetModules()
  })

  async function crear(respuesta: () => { getText: () => string }) {
    vi.resetModules()
    vi.doMock('@zxing/browser', () => ({
      BrowserMultiFormatReader: class {
        constructor(pistas: Map<number, unknown>) {
          lectores.push({ pistas, respuesta })
        }
        decodeFromCanvas() {
          return respuesta()
        }
      },
    }))
    const { crearDecodificadorZxing: crearAislado } = await import('./escaneo')
    return crearAislado()
  }

  const falla = (nombre: string) => () => {
    throw Object.assign(new Error(nombre), { name: nombre })
  }
  /**
   * La excepción **real** de la librería, con el `name` que le deja el minificador del build de producción (una letra): la librería
   * lo toma del nombre de la función constructora y no lo fija ella. El 2026-10-16 el escáner se detenía en el primer cuadro sin QR
   * porque se reconocía por `name` («No se pudo leer el código»). Lo que sobrevive a la minificación es `kind`/`getKind()`.
   */
  const fallaRealMinificada = (Clase: typeof NotFoundException | typeof ChecksumException | typeof FormatException) => () => {
    const error = new Clase()
    Object.defineProperty(error, 'name', { value: 't' })
    throw error
  }
  const lienzo = {} as HTMLCanvasElement

  it('devuelve el texto del código leído', async () => {
    const decodificador = await crear(() => ({ getText: () => 'LSCABN3E2VE840638' }))
    expect(decodificador.decodificar(lienzo)).toBe('LSCABN3E2VE840638')
  })

  it.each([
    ['NotFoundException', NotFoundException],
    ['ChecksumException', ChecksumException],
    ['FormatException', FormatException],
  ] as const)('«%s» real, con el nombre minificado del build de producción, es un cuadro sin código: devuelve null', async (_nombre, Clase) => {
    const decodificador = await crear(fallaRealMinificada(Clase))
    expect(decodificador.decodificar(lienzo)).toBeNull()
  })

  it('un cuadro sin código no detiene la lectura: los siguientes se siguen leyendo hasta encontrar el QR', async () => {
    let cuadro = 0
    const decodificador = await crear(() => {
      cuadro++
      if (cuadro < 4) fallaRealMinificada(NotFoundException)()
      return { getText: () => 'QR-DE-LA-TABLET' }
    })
    expect([1, 2, 3, 4].map(() => decodificador.decodificar(lienzo))).toEqual([null, null, null, 'QR-DE-LA-TABLET'])
  })

  it('cualquier otro error SÍ se propaga: no se confunde con «no hay código»', async () => {
    const decodificador = await crear(falla('TypeError'))
    expect(() => decodificador.decodificar(lienzo)).toThrow()
  })

  it('otra excepción real de la librería (que no es de «sin código») SÍ se propaga', async () => {
    const decodificador = await crear(() => {
      throw new IllegalStateException('lector en mal estado')
    })
    expect(() => decodificador.decodificar(lienzo)).toThrow('lector en mal estado')
  })

  it('un error ajeno que se llame como una de las excepciones de «sin código» SÍ se propaga: lo que cuenta es el tipo de la librería, no el nombre', async () => {
    const decodificador = await crear(falla('NotFoundException'))
    expect(() => decodificador.decodificar(lienzo)).toThrow()
  })

  it('pide los formatos del VIN (QR, Code 128, Code 39, Data Matrix) y esforzarse en leer', async () => {
    await crear(() => ({ getText: () => 'x' }))
    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library')
    const pistas = lectores[0]!.pistas
    expect(pistas.get(DecodeHintType.POSSIBLE_FORMATS)).toEqual([BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.DATA_MATRIX])
    expect(pistas.get(DecodeHintType.TRY_HARDER)).toBe(true)
  })

  it('exporta la función real también fuera del aislamiento', () => {
    expect(typeof crearDecodificadorZxing).toBe('function')
  })
})
