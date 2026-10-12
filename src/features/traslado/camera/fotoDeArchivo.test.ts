// @vitest-environment node
/** T12 · una foto elegida de la galería pasa por el mismo JPEG verificado que la de la cámara. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContextoLike, LienzoLike } from './captureFrame'
import { CALIDAD_JPEG } from './config'
import { type ImagenDecodificada, decodificarEnNavegador, fotoDesdeArchivo } from './fotoDeArchivo'

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' })

class FakeLienzo implements LienzoLike {
  width = 300
  height = 150
  dibujos: unknown[][] = []
  pedidosDeBlob: Array<{ tipo?: string; calidad?: number }> = []
  contexto: ContextoLike | null = { drawImage: (...args: unknown[]) => void this.dibujos.push(args) }
  alPedirBlob: (callback: (blob: Blob | null) => void) => void = (callback) => callback(jpeg())
  getContext(): ContextoLike | null {
    return this.contexto
  }
  toBlob(callback: (blob: Blob | null) => void, tipo?: string, calidad?: number): void {
    this.pedidosDeBlob.push({ tipo, calidad })
    this.alPedirBlob(callback)
  }
  get liberado() {
    return this.width === 0 && this.height === 0
  }
}

const AHORA = 1_800_000_000_000
/** Un archivo de la galería: el `File` de Node no existe en todos los entornos, basta un Blob con `lastModified`. */
const archivo = (opciones: { tipo?: string; bytes?: number; modificado?: number } = {}) =>
  Object.assign(new Blob([new Uint8Array(opciones.bytes ?? 10)], { type: opciones.tipo ?? 'image/jpeg' }), {
    lastModified: opciones.modificado ?? AHORA - 3_600_000,
  })

function imagen(ancho: number, alto: number) {
  const liberar = vi.fn()
  const decodificada: ImagenDecodificada = { fuente: { esImagen: true }, ancho, alto, liberar }
  return { decodificada, liberar }
}

function convertir(
  entrada: Blob,
  { ancho = 4032, alto = 3024, decodificar }: { ancho?: number; alto?: number; decodificar?: () => Promise<ImagenDecodificada> } = {},
  preparar: (lienzo: FakeLienzo) => void = () => undefined,
) {
  const lienzo = new FakeLienzo()
  preparar(lienzo)
  const { decodificada, liberar } = imagen(ancho, alto)
  const resultado = fotoDesdeArchivo(entrada, {
    decodificar: decodificar ?? (async () => decodificada),
    crearLienzo: () => lienzo,
    reloj: () => AHORA,
  })
  return { resultado, lienzo, liberar, decodificada }
}

describe('una foto correcta de la galería', () => {
  it('sale como JPEG verificado, reducida al lado largo máximo, con la proporción original', async () => {
    const { resultado } = convertir(archivo(), { ancho: 4032, alto: 3024 })
    const r = await resultado
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.foto.blob.type).toBe('image/jpeg')
    expect(r.foto.blob.size).toBeGreaterThan(0)
    expect(r.foto.ancho).toBe(1920)
    expect(r.foto.alto).toBe(1440)
  })

  it('una foto pequeña no se amplía', async () => {
    const r = await convertir(archivo(), { ancho: 800, alto: 600 }).resultado
    expect(r.ok && [r.foto.ancho, r.foto.alto]).toEqual([800, 600])
  })

  it('dibuja la imagen decodificada (no el archivo) y pide JPEG con la calidad configurada', async () => {
    const { resultado, lienzo, decodificada } = convertir(archivo())
    await resultado
    expect(lienzo.dibujos[0]?.[0]).toBe(decodificada.fuente)
    expect(lienzo.pedidosDeBlob).toEqual([{ tipo: 'image/jpeg', calidad: CALIDAD_JPEG }])
  })

  it('una foto HEIC o PNG del iPhone también sirve: se vuelve a codificar como JPEG', async () => {
    for (const tipo of ['image/heic', 'image/heif', 'image/png', 'image/webp']) {
      const r = await convertir(archivo({ tipo })).resultado
      expect(r.ok && r.foto.blob.type, tipo).toBe('image/jpeg')
    }
  })

  it('un tipo vacío se intenta decodificar igual', async () => {
    const r = await convertir(archivo({ tipo: '' })).resultado
    expect(r.ok).toBe(true)
  })
})

describe('la fecha es la medida: la del archivo', () => {
  it('usa la fecha de modificación del archivo, no la de ahora', async () => {
    const modificado = AHORA - 86_400_000
    const r = await convertir(archivo({ modificado })).resultado
    expect(r.ok && r.foto.creadaEn).toBe(modificado)
  })

  it('una fecha futura (reloj mal puesto) cae a la de ahora', async () => {
    const r = await convertir(archivo({ modificado: AHORA + 10 * 86_400_000 })).resultado
    expect(r.ok && r.foto.creadaEn).toBe(AHORA)
  })

  it('una fecha ausente, cero o inválida cae a la de ahora', async () => {
    for (const modificado of [0, -5, Number.NaN]) {
      const r = await convertir(archivo({ modificado })).resultado
      expect(r.ok && r.foto.creadaEn, String(modificado)).toBe(AHORA)
    }
    const sinFecha = new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
    const r = await convertir(sinFecha).resultado
    expect(r.ok && r.foto.creadaEn).toBe(AHORA)
  })
})

describe('lo que no es una foto utilizable', () => {
  it.each(['application/pdf', 'text/plain', 'video/mp4'])('un archivo %s se rechaza sin decodificarlo', async (tipo) => {
    const decodificar = vi.fn()
    const r = await fotoDesdeArchivo(archivo({ tipo }), { decodificar })
    expect(r).toMatchObject({ ok: false, error: { codigo: 'ARCHIVO_INVALIDO' } })
    expect(decodificar).not.toHaveBeenCalled()
  })

  it('un archivo vacío se rechaza como foto vacía', async () => {
    const r = await convertir(archivo({ bytes: 0 })).resultado
    expect(r).toMatchObject({ ok: false, error: { codigo: 'BLOB_VACIO' } })
  })

  it('una imagen que el navegador no puede decodificar → ARCHIVO_INVALIDO, sin lanzar', async () => {
    const r = await convertir(archivo(), {
      decodificar: async () => {
        throw new DOMException('no se puede decodificar', 'EncodingError')
      },
    }).resultado
    expect(r).toMatchObject({ ok: false, error: { codigo: 'ARCHIVO_INVALIDO' } })
  })

  it('una falta de memoria al decodificar → MEMORIA_AGOTADA', async () => {
    const r = await convertir(archivo(), {
      decodificar: async () => {
        throw new RangeError('Out of memory')
      },
    }).resultado
    expect(r).toMatchObject({ ok: false, error: { codigo: 'MEMORIA_AGOTADA' } })
  })

  it('una imagen de 0×0 → ARCHIVO_INVALIDO', async () => {
    const r = await convertir(archivo(), { ancho: 0, alto: 0 }).resultado
    expect(r).toMatchObject({ ok: false, error: { codigo: 'ARCHIVO_INVALIDO' } })
  })

  it('si el JPEG sale en otro formato, no se acepta', async () => {
    const r = await convertir(archivo(), {}, (lienzo) => {
      lienzo.alPedirBlob = (cb) => cb(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    }).resultado
    expect(r).toMatchObject({ ok: false, error: { codigo: 'FORMATO_INCORRECTO' } })
  })

  it('el mensaje de un archivo inválido le dice al operario qué hacer', async () => {
    const r = await fotoDesdeArchivo(archivo({ tipo: 'application/pdf' }))
    expect(!r.ok && r.error.message).toMatch(/Elige una foto/)
  })
})

describe('no deja memoria ocupada', () => {
  it('suelta la imagen y el lienzo tras un éxito', async () => {
    const { resultado, lienzo, liberar } = convertir(archivo())
    await resultado
    expect(liberar).toHaveBeenCalledTimes(1)
    expect(lienzo.liberado).toBe(true)
  })

  it('suelta la imagen y el lienzo también cuando la conversión falla', async () => {
    const { resultado, lienzo, liberar } = convertir(archivo(), {}, (l) => {
      l.alPedirBlob = (cb) => cb(null)
    })
    expect((await resultado).ok).toBe(false)
    expect(liberar).toHaveBeenCalledTimes(1)
    expect(lienzo.liberado).toBe(true)
  })

  it('suelta la imagen aunque sea de 0×0', async () => {
    const { resultado, liberar } = convertir(archivo(), { ancho: 0, alto: 0 })
    await resultado
    expect(liberar).toHaveBeenCalledTimes(1)
  })
})

describe('el decodificador del navegador', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('pide que se respete la orientación EXIF: la foto del iPhone tomada de lado sale derecha', async () => {
    const cerrar = vi.fn()
    const createImageBitmap = vi.fn(async () => ({ width: 3024, height: 4032, close: cerrar }))
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const archivoElegido = archivo()

    const imagenDecodificada = await decodificarEnNavegador(archivoElegido)

    expect(createImageBitmap).toHaveBeenCalledWith(archivoElegido, { imageOrientation: 'from-image' })
    expect([imagenDecodificada.ancho, imagenDecodificada.alto]).toEqual([3024, 4032])
    imagenDecodificada.liberar()
    expect(cerrar).toHaveBeenCalledTimes(1)
  })
})
