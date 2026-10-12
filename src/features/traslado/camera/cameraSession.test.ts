// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CameraSession } from './cameraSession'
import { CapturaError, type FotoCapturada, type ResultadoCaptura } from './captureFrame'
import { RESTRICCIONES_MINIMAS, RESTRICCIONES_PREFERIDAS } from './config'
import { TransicionCamaraInvalidaError } from './estadoCamara'
import type { EntornoNavegador } from './plataforma'
import {
  ENTORNO_SEGURO,
  FakeDocument,
  FakeStream,
  FakeVideo,
  USER_AGENT_ANDROID,
  USER_AGENT_IPHONE,
  errorDeDom,
  vaciarPromesas,
} from './testing/fakes'

afterEach(() => vi.useRealTimers())

const fotoFalsa = (): FotoCapturada => ({
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  ancho: 1280,
  alto: 720,
  creadaEn: 1_700_000_000_000,
})

interface Opciones {
  entorno?: Partial<EntornoNavegador>
  abrirCamara?: (restricciones: MediaStreamConstraints) => Promise<MediaStream>
  tiempoPrimerFrameMs?: number
  capturarFrame?: () => Promise<ResultadoCaptura>
  reloj?: () => number
}

function montar(opciones: Opciones = {}) {
  const streams: FakeStream[] = []
  const abrirCamara = vi.fn<(r: MediaStreamConstraints) => Promise<MediaStream>>(
    opciones.abrirCamara ??
      (async () => {
        const stream = new FakeStream()
        streams.push(stream)
        return stream.como()
      }),
  )
  const video = new FakeVideo()
  const documento = new FakeDocument()
  const capturarFrame = vi.fn<() => Promise<ResultadoCaptura>>(opciones.capturarFrame ?? (async () => ({ ok: true, foto: fotoFalsa() })))
  const urls: string[] = []
  const revocadas: string[] = []
  const sesion = new CameraSession({
    abrirCamara,
    entorno: { ...ENTORNO_SEGURO, ...opciones.entorno },
    documento,
    tiempoPrimerFrameMs: opciones.tiempoPrimerFrameMs,
    capturarFrame,
    crearUrl: () => {
      const url = `blob:foto-${urls.length + 1}`
      urls.push(url)
      return url
    },
    revocarUrl: (url) => revocadas.push(url),
    reloj: opciones.reloj,
  })
  sesion.conectarVideo(video)

  const estado = () => sesion.getSnapshot().estado
  /** Abre y simula el primer frame; deja la sesión en `lista`. */
  const abrirHastaLista = async () => {
    const abrir = sesion.abrir()
    await vaciarPromesas()
    video.mostrarFrame()
    await abrir
  }
  return { sesion, video, documento, abrirCamara, streams, estado, abrirHastaLista, capturarFrame, urls, revocadas }
}

describe('T1 · soporte y errores', () => {
  it('AC1: sin contexto seguro, no llama a getUserMedia y queda sinSoporte', async () => {
    const m = montar({ entorno: { isSecureContext: false } })

    await m.sesion.abrir()

    expect(m.estado()).toBe('sinSoporte')
    expect(m.sesion.getSnapshot().error?.codigo).toBe('CONTEXTO_INSEGURO')
    expect(m.sesion.getSnapshot().error?.message).toContain('HTTPS')
    expect(m.abrirCamara).not.toHaveBeenCalled()
    expect(m.documento.oyentes).toBe(0) // ni siquiera vigila la visibilidad
  })

  it('AC1: sin mediaDevices tampoco llama al navegador', async () => {
    const m = montar({ entorno: { mediaDevices: undefined } })
    await m.sesion.abrir()
    expect(m.estado()).toBe('sinSoporte')
    expect(m.sesion.getSnapshot().error?.codigo).toBe('SIN_SOPORTE')
    expect(m.abrirCamara).not.toHaveBeenCalled()
  })

  it.each([
    ['iPhone', USER_AGENT_IPHONE, 'iPhone', 'Ajustes › Safari › Cámara'],
    ['Android', USER_AGENT_ANDROID, 'Linux armv81', 'candado'],
  ])('AC2: permiso denegado en %s → error con sus instrucciones', async (_nombre, userAgent, platform, instruccion) => {
    const m = montar({
      entorno: { userAgent, platform, maxTouchPoints: 5 },
      abrirCamara: () => Promise.reject(errorDeDom('NotAllowedError')),
    })

    await m.sesion.abrir()

    const { error } = m.sesion.getSnapshot()
    expect(m.estado()).toBe('error')
    expect(error?.codigo).toBe('PERMISO_DENEGADO')
    expect(error?.message).toContain(instruccion)
    expect(error?.reintentable).toBe(true)
  })

  it('AC2: «Reintentar» tras un permiso denegado vuelve a pedir la cámara y funciona', async () => {
    let intento = 0
    const m = montar({
      abrirCamara: async () => {
        intento++
        if (intento === 1) throw errorDeDom('NotAllowedError')
        return new FakeStream().como()
      },
    })
    await m.sesion.abrir()
    expect(m.estado()).toBe('error')

    const reintento = m.sesion.reintentar()
    await vaciarPromesas()
    m.video.mostrarFrame()
    await reintento

    expect(m.estado()).toBe('lista')
    expect(m.sesion.getSnapshot().error).toBeNull()
    expect(m.abrirCamara).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['NotFoundError', 'SIN_CAMARA', 'No se encontró ninguna cámara'],
    ['NotReadableError', 'CAMARA_OCUPADA', 'Otra aplicación está usando la cámara'],
  ])('AC3: %s → %s', async (nombre, codigo, mensaje) => {
    const m = montar({ abrirCamara: () => Promise.reject(errorDeDom(nombre)) })
    await m.sesion.abrir()
    expect(m.estado()).toBe('error')
    expect(m.sesion.getSnapshot().error?.codigo).toBe(codigo)
    expect(m.sesion.getSnapshot().error?.message).toContain(mensaje)
  })

  it('AC4: OverconstrainedError reintenta con restricciones mínimas y no muestra error si funciona', async () => {
    const llamadas: MediaStreamConstraints[] = []
    const m = montar({
      abrirCamara: async (restricciones) => {
        llamadas.push(restricciones)
        if (llamadas.length === 1) throw errorDeDom('OverconstrainedError')
        return new FakeStream().como()
      },
    })

    await m.abrirHastaLista()

    expect(llamadas).toEqual([RESTRICCIONES_PREFERIDAS, RESTRICCIONES_MINIMAS])
    expect(m.estado()).toBe('lista')
    expect(m.sesion.getSnapshot().error).toBeNull()
  })

  it('AC4: si las mínimas también fallan, se muestra el error', async () => {
    const m = montar({ abrirCamara: () => Promise.reject(errorDeDom('OverconstrainedError')) })
    await m.sesion.abrir()
    expect(m.estado()).toBe('error')
    expect(m.abrirCamara).toHaveBeenCalledTimes(2)
  })
})

describe('T2 · sesión de cámara', () => {
  it('AC1: abre una sola vez aunque se tomen las 6 fotos', async () => {
    const m = montar()
    await m.abrirHastaLista()

    for (let foto = 0; foto < 6; foto++) {
      await m.sesion.capturar()
      m.sesion.cerrarRevision()
    }

    expect(m.abrirCamara).toHaveBeenCalledTimes(1)
    expect(m.estado()).toBe('lista')
  })

  it('AC2: sin primer frame no está lista; con el frame, sí', async () => {
    const m = montar()
    const abrir = m.sesion.abrir()
    await vaciarPromesas()

    expect(m.estado()).toBe('iniciando')
    expect(m.video.muted).toBe(true)
    expect(m.video.playsInline).toBe(true)
    expect(m.video.autoplay).toBe(true)

    m.video.mostrarFrame()
    await abrir
    expect(m.estado()).toBe('lista')
  })

  it('AC2: un video con ancho 0 no cuenta como frame, aunque dispare eventos', async () => {
    const m = montar()
    const abrir = m.sesion.abrir()
    await vaciarPromesas()

    m.video.dispatchEvent(new Event('loadedmetadata'))
    m.video.dispatchEvent(new Event('playing'))
    expect(m.estado()).toBe('iniciando')

    m.video.mostrarFrame()
    await abrir
    expect(m.estado()).toBe('lista')
  })

  it('AC2: si el primer frame no llega en el tiempo límite, error reintentable y se suelta la cámara', async () => {
    vi.useFakeTimers()
    const m = montar({ tiempoPrimerFrameMs: 8_000 })

    const abrir = m.sesion.abrir()
    await vi.advanceTimersByTimeAsync(7_999)
    expect(m.estado()).toBe('iniciando')
    await vi.advanceTimersByTimeAsync(1)
    await abrir

    expect(m.estado()).toBe('error')
    expect(m.sesion.getSnapshot().error?.codigo).toBe('TIEMPO_AGOTADO')
    expect(m.sesion.getSnapshot().error?.reintentable).toBe(true)
    expect(m.streams[0]?.track.detenciones).toBe(1)
  })

  it('AC3: al pasar a segundo plano se suspende y se suelta la cámara', async () => {
    const m = montar()
    await m.abrirHastaLista()

    m.documento.cambiar('hidden')

    expect(m.estado()).toBe('suspendida')
    expect(m.streams[0]?.track.detenciones).toBe(1)
    expect(m.video.srcObject).toBeNull()
  })

  it('AC3: si el track termina solo, se suspende y se reabre porque la página sigue visible', async () => {
    const m = montar()
    await m.abrirHastaLista()

    m.streams[0]?.track.terminarPorSuCuenta()
    expect(m.estado()).toBe('solicitando') // ya empezó a reabrir
    await vaciarPromesas()
    m.video.mostrarFrame()
    await vaciarPromesas()

    expect(m.estado()).toBe('lista')
    expect(m.abrirCamara).toHaveBeenCalledTimes(2)
  })

  it('AC3: si el track termina con la página oculta, queda suspendida y no reabre a escondidas', async () => {
    const m = montar()
    await m.abrirHastaLista()
    m.documento.visibilityState = 'hidden' // sin disparar el evento: el track termina primero

    m.streams[0]?.track.terminarPorSuCuenta()
    await vaciarPromesas()

    expect(m.estado()).toBe('suspendida')
    expect(m.abrirCamara).toHaveBeenCalledTimes(1)
  })

  it('AC4: al volver a primer plano reabre la cámara sola', async () => {
    const m = montar()
    await m.abrirHastaLista()
    m.documento.cambiar('hidden')

    m.documento.cambiar('visible')
    await vaciarPromesas()
    expect(m.estado()).toBe('iniciando')
    m.video.mostrarFrame()
    await vaciarPromesas()

    expect(m.estado()).toBe('lista')
    expect(m.abrirCamara).toHaveBeenCalledTimes(2)
    expect(m.sesion.getSnapshot().requiereGesto).toBe(false)
  })

  it('AC4: si el navegador exige un toque, queda suspendida pidiendo el gesto, no con un error de permisos', async () => {
    let intento = 0
    const m = montar({
      abrirCamara: async () => {
        intento++
        if (intento === 2) throw errorDeDom('NotAllowedError')
        return new FakeStream().como()
      },
    })
    await m.abrirHastaLista()
    m.documento.cambiar('hidden')

    m.documento.cambiar('visible')
    await vaciarPromesas()

    expect(m.estado()).toBe('suspendida')
    expect(m.sesion.getSnapshot().requiereGesto).toBe(true)
    expect(m.sesion.getSnapshot().error).toBeNull()

    // El operario toca «Tocar para reactivar la cámara».
    const toque = m.sesion.reintentar()
    await vaciarPromesas()
    m.video.mostrarFrame()
    await toque
    expect(m.estado()).toBe('lista')
    expect(m.sesion.getSnapshot().requiereGesto).toBe(false)
  })

  it('AC4: si tras el toque el permiso sigue denegado, ahora sí es un error con instrucciones', async () => {
    let intento = 0
    const m = montar({
      abrirCamara: async () => {
        intento++
        if (intento >= 2) throw errorDeDom('NotAllowedError')
        return new FakeStream().como()
      },
    })
    await m.abrirHastaLista()
    m.documento.cambiar('hidden')
    m.documento.cambiar('visible')
    await vaciarPromesas()
    expect(m.estado()).toBe('suspendida')

    await m.sesion.reintentar()

    expect(m.estado()).toBe('error')
    expect(m.sesion.getSnapshot().error?.codigo).toBe('PERMISO_DENEGADO')
  })

  it('AC5: si play() se rechaza, error con botón de inicio y sin soltar el stream; el toque lo arranca', async () => {
    const m = montar()
    m.video.jugar = () => Promise.reject(errorDeDom('NotAllowedError'))

    await m.sesion.abrir()

    expect(m.estado()).toBe('error')
    expect(m.sesion.getSnapshot().error?.codigo).toBe('REPRODUCCION_RECHAZADA')
    expect(m.sesion.getSnapshot().requiereGesto).toBe(true)
    expect(m.streams[0]?.track.detenciones).toBe(0) // el stream sigue vivo

    m.video.jugar = () => Promise.resolve()
    const toque = m.sesion.reintentar()
    await vaciarPromesas()
    m.video.mostrarFrame()
    await toque

    expect(m.estado()).toBe('lista')
    expect(m.abrirCamara).toHaveBeenCalledTimes(1) // no pidió otra cámara
  })

  it('AC6: al cerrar, detiene todos los tracks, deja el video limpio y quita todos los oyentes', async () => {
    const m = montar()
    await m.abrirHastaLista()
    expect(m.documento.oyentes).toBe(1)
    expect(m.streams[0]?.track.oyentes).toBe(3) // ended, mute, unmute

    m.sesion.cerrar()

    expect(m.estado()).toBe('inactiva')
    expect(m.streams[0]?.track.detenciones).toBe(1)
    expect(m.video.srcObject).toBeNull()
    expect(m.documento.oyentes).toBe(0)
    expect(m.streams[0]?.track.oyentes).toBe(0)
    expect(m.video.oyentes).toBe(0)

    // Y lo que pase después ya no le afecta.
    m.documento.cambiar('hidden')
    m.documento.cambiar('visible')
    await vaciarPromesas()
    expect(m.estado()).toBe('inactiva')
    expect(m.abrirCamara).toHaveBeenCalledTimes(1)
  })

  it('AC6: si se cierra mientras el navegador aún pide permiso, la cámara que llegue tarde se suelta', async () => {
    const stream = new FakeStream()
    let entregar: (s: MediaStream) => void = () => undefined
    const m = montar({ abrirCamara: () => new Promise<MediaStream>((resolver) => (entregar = resolver)) })

    const abrir = m.sesion.abrir()
    expect(m.estado()).toBe('solicitando')
    m.sesion.cerrar()
    entregar(stream.como())
    await abrir

    expect(m.estado()).toBe('inactiva')
    expect(stream.track.detenciones).toBe(1)
    expect(m.video.srcObject).toBeNull()
  })

  it('AC6: una sesión cerrada se puede volver a abrir (el modo estricto de React monta dos veces)', async () => {
    const m = montar()
    const primera = m.sesion.abrir()
    m.sesion.cerrar()
    await primera
    expect(m.estado()).toBe('inactiva')

    await m.abrirHastaLista()
    expect(m.estado()).toBe('lista')
    expect(m.streams.every((s, i) => (i === m.streams.length - 1 ? s.track.detenciones === 0 : s.track.detenciones === 1))).toBe(true)
  })

  it('una interrupción (mute) suspende sin soltar el stream, y al reactivarse reanuda sin pedir otra cámara', async () => {
    const m = montar()
    await m.abrirHastaLista()
    const track = m.streams[0]!.track

    track.dispatchEvent(new Event('mute'))
    expect(m.estado()).toBe('suspendida')
    expect(track.detenciones).toBe(0)

    track.dispatchEvent(new Event('unmute'))
    await vaciarPromesas()
    m.video.mostrarFrame()
    await vaciarPromesas()

    expect(m.estado()).toBe('lista')
    expect(m.abrirCamara).toHaveBeenCalledTimes(1)
  })

  it('un unmute con la sesión lista no hace nada', async () => {
    const m = montar()
    await m.abrirHastaLista()
    m.streams[0]?.track.dispatchEvent(new Event('unmute'))
    await vaciarPromesas()
    expect(m.estado()).toBe('lista')
  })

  it('AC7: una transición no permitida lanza un error de programación', async () => {
    const m = montar()
    expect(() => m.sesion.cerrarRevision()).toThrow(TransicionCamaraInvalidaError) // inactiva → lista

    await m.abrirHastaLista()
    expect(() => m.sesion.cerrarRevision()).toThrow(TransicionCamaraInvalidaError) // lista → lista
  })

  it('abrir sin haber conectado un video es un error de programación y no deja la sesión a medias', async () => {
    const sesion = new CameraSession({ entorno: ENTORNO_SEGURO, documento: new FakeDocument() })
    await expect(sesion.abrir()).rejects.toThrow('conectarVideo')
    expect(sesion.getSnapshot().estado).toBe('inactiva')
  })

  it('abrir dos veces seguidas no duplica la apertura', async () => {
    const m = montar()
    const primera = m.sesion.abrir()
    const segunda = m.sesion.abrir()
    await vaciarPromesas()
    m.video.mostrarFrame()
    await Promise.all([primera, segunda])
    expect(m.abrirCamara).toHaveBeenCalledTimes(1)
  })
})

describe('T3 · captura en la sesión', () => {
  it('AC1: una captura correcta deja la foto en revisión, con su vista previa', async () => {
    const m = montar()
    await m.abrirHastaLista()

    const resultado = await m.sesion.capturar()

    expect(resultado?.ok).toBe(true)
    expect(m.estado()).toBe('revisando')
    const { foto, errorCaptura } = m.sesion.getSnapshot()
    expect(foto?.blob.type).toBe('image/jpeg')
    expect(foto?.urlVistaPrevia).toBe('blob:foto-1')
    expect(errorCaptura).toBeNull()
    expect(m.capturarFrame).toHaveBeenCalledTimes(1)
    expect(m.capturarFrame).toHaveBeenCalledWith(m.video)
  })

  it('el instante de la captura llega intacto a la foto en revisión', async () => {
    const m = montar({ capturarFrame: async () => ({ ok: true, foto: { ...fotoFalsa(), creadaEn: 1_234 } }) })
    await m.abrirHastaLista()
    await m.sesion.capturar()
    expect(m.sesion.getSnapshot().foto?.creadaEn).toBe(1_234)
  })

  it('AC2 y AC5: una captura fallida deja la cámara en «lista» con el motivo y sin vista previa; la siguiente lo borra', async () => {
    const m = montar()
    await m.abrirHastaLista()
    m.capturarFrame.mockResolvedValueOnce({ ok: false, error: new CapturaError('BLOB_VACIO') })

    const resultado = await m.sesion.capturar()

    expect(resultado?.ok).toBe(false)
    expect(m.estado()).toBe('lista')
    expect(m.sesion.getSnapshot().errorCaptura?.codigo).toBe('BLOB_VACIO')
    expect(m.sesion.getSnapshot().foto).toBeNull()
    expect(m.urls).toEqual([])

    await m.sesion.capturar() // la segunda sí sale bien
    expect(m.estado()).toBe('revisando')
    expect(m.sesion.getSnapshot().errorCaptura).toBeNull()
  })

  it('AC5: si la captura lanza una excepción inesperada, igual vuelve a «lista» como CAPTURA_FALLIDA', async () => {
    const m = montar({
      capturarFrame: async () => {
        throw new Error('algo imprevisto')
      },
    })
    await m.abrirHastaLista()

    const resultado = await m.sesion.capturar()

    expect(resultado?.ok === false && resultado.error.codigo).toBe('CAPTURA_FALLIDA')
    expect(m.estado()).toBe('lista')
  })

  it('AC3: dos toques seguidos procesan solo uno', async () => {
    const m = montar()
    await m.abrirHastaLista()

    const [primero, segundo] = await Promise.all([m.sesion.capturar(), m.sesion.capturar()])

    expect(primero?.ok).toBe(true)
    expect(segundo).toBeNull()
    expect(m.capturarFrame).toHaveBeenCalledTimes(1)
    expect(m.urls).toHaveLength(1)
  })

  it('no captura si la cámara no está «lista»: inactiva, iniciando o con una foto en revisión', async () => {
    const m = montar()
    expect(await m.sesion.capturar()).toBeNull() // inactiva

    const abrir = m.sesion.abrir()
    await vaciarPromesas()
    expect(m.estado()).toBe('iniciando')
    expect(await m.sesion.capturar()).toBeNull() // todavía sin frame

    m.video.mostrarFrame()
    await abrir
    await m.sesion.capturar()
    expect(m.estado()).toBe('revisando')
    expect(await m.sesion.capturar()).toBeNull() // ya hay una foto esperando

    expect(m.capturarFrame).toHaveBeenCalledTimes(1)
  })

  it('si la cámara se pausa mientras se captura, el resultado se descarta sin romper ni dejar vista previa', async () => {
    let entregar: (r: ResultadoCaptura) => void = () => undefined
    const m = montar({ capturarFrame: () => new Promise<ResultadoCaptura>((resolver) => (entregar = resolver)) })
    await m.abrirHastaLista()

    const captura = m.sesion.capturar()
    expect(m.estado()).toBe('capturando')
    m.documento.cambiar('hidden')
    entregar({ ok: true, foto: fotoFalsa() })
    const resultado = await captura

    expect(resultado?.ok === false && resultado.error.codigo).toBe('INTERRUMPIDA')
    expect(m.estado()).toBe('suspendida')
    expect(m.sesion.getSnapshot().foto).toBeNull()
    expect(m.urls).toEqual([])
  })

  it('la vista previa se revoca al repetir', async () => {
    const m = montar()
    await m.abrirHastaLista()
    await m.sesion.capturar()
    expect(m.revocadas).toEqual([])

    m.sesion.cerrarRevision()

    expect(m.revocadas).toEqual(['blob:foto-1'])
    expect(m.estado()).toBe('lista')
    expect(m.sesion.getSnapshot().foto).toBeNull()
  })

  it('la vista previa se revoca también si la cámara se pausa o la sesión se cierra', async () => {
    const pausada = montar()
    await pausada.abrirHastaLista()
    await pausada.sesion.capturar()
    pausada.documento.cambiar('hidden')
    expect(pausada.revocadas).toEqual(['blob:foto-1'])

    const cerrada = montar()
    await cerrada.abrirHastaLista()
    await cerrada.sesion.capturar()
    cerrada.sesion.cerrar()
    expect(cerrada.revocadas).toEqual(['blob:foto-1'])
  })

  it('cada foto en revisión tiene su propia URL y solo la última sigue viva', async () => {
    const m = montar()
    await m.abrirHastaLista()

    await m.sesion.capturar()
    m.sesion.cerrarRevision()
    await m.sesion.capturar()

    expect(m.urls).toEqual(['blob:foto-1', 'blob:foto-2'])
    expect(m.revocadas).toEqual(['blob:foto-1'])
    expect(m.sesion.getSnapshot().foto?.urlVistaPrevia).toBe('blob:foto-2')
  })
})

describe('T3 · protección contra el toque accidental (C12)', () => {
  it('«Repetir» se ignora durante los primeros 500 ms y funciona después', async () => {
    let ahora = 1_000
    const m = montar({ reloj: () => ahora })
    await m.abrirHastaLista()
    await m.sesion.capturar() // la foto aparece en t = 1000

    ahora = 1_499
    expect(m.sesion.repetir()).toBe(false)
    expect(m.estado()).toBe('revisando')
    expect(m.sesion.getSnapshot().foto).not.toBeNull()
    expect(m.revocadas).toEqual([])

    ahora = 1_500
    expect(m.sesion.repetir()).toBe(true)
    expect(m.estado()).toBe('lista')
    expect(m.revocadas).toEqual(['blob:foto-1'])
  })

  it('el plazo se cuenta de nuevo con cada foto', async () => {
    let ahora = 0
    const m = montar({ reloj: () => ahora })
    await m.abrirHastaLista()

    await m.sesion.capturar()
    ahora = 10_000
    expect(m.sesion.repetir()).toBe(true)

    await m.sesion.capturar() // otra foto, en t = 10000
    ahora = 10_100
    expect(m.sesion.repetir()).toBe(false)
    ahora = 10_500
    expect(m.sesion.repetir()).toBe(true)
  })
})

describe('T5 · cierre de la revisión', () => {
  it('toquePermitidoEnRevision solo es verdadero en «revisando» y pasado el plazo', async () => {
    let ahora = 0
    const m = montar({ reloj: () => ahora })
    expect(m.sesion.toquePermitidoEnRevision()).toBe(false) // inactiva
    await m.abrirHastaLista()
    expect(m.sesion.toquePermitidoEnRevision()).toBe(false) // lista

    await m.sesion.capturar()
    expect(m.sesion.toquePermitidoEnRevision()).toBe(false) // recién aparecida
    ahora = 500
    expect(m.sesion.toquePermitidoEnRevision()).toBe(true)
  })

  it('repetir() fuera de «revisando» se ignora sin lanzar', async () => {
    const m = montar()
    expect(m.sesion.repetir()).toBe(false) // inactiva
    await m.abrirHastaLista()
    expect(m.sesion.repetir()).toBe(false) // lista
    expect(m.estado()).toBe('lista')
  })

  it('cerrarRevisionSiSigue vuelve a «lista» si hay una foto en revisión y revoca su URL', async () => {
    const m = montar()
    await m.abrirHastaLista()
    await m.sesion.capturar()

    m.sesion.cerrarRevisionSiSigue()

    expect(m.estado()).toBe('lista')
    expect(m.revocadas).toEqual(['blob:foto-1'])
  })

  it('cerrarRevisionSiSigue no hace nada, ni lanza, si la cámara ya se pausó', async () => {
    const m = montar()
    await m.abrirHastaLista()
    await m.sesion.capturar()
    m.documento.cambiar('hidden')

    expect(() => m.sesion.cerrarRevisionSiSigue()).not.toThrow()
    expect(m.estado()).toBe('suspendida')
  })
})

describe('suscripción (para useSyncExternalStore)', () => {
  it('avisa de cada cambio de estado, en orden', async () => {
    const m = montar()
    const vistos: string[] = []
    m.sesion.suscribir(() => vistos.push(m.estado()))

    await m.abrirHastaLista()
    m.sesion.cerrar()

    expect(vistos).toEqual(['solicitando', 'iniciando', 'lista', 'inactiva'])
  })

  it('la foto del estado solo cambia de identidad cuando cambia algo', async () => {
    const m = montar()
    const antes = m.sesion.getSnapshot()
    expect(m.sesion.getSnapshot()).toBe(antes)

    await m.abrirHastaLista()
    const despues = m.sesion.getSnapshot()
    expect(despues).not.toBe(antes)
    expect(m.sesion.getSnapshot()).toBe(despues)
  })

  it('quien se da de baja deja de recibir avisos', async () => {
    const m = montar()
    const alAvisar = vi.fn()
    const baja = m.sesion.suscribir(alAvisar)
    baja()

    await m.abrirHastaLista()

    expect(alAvisar).not.toHaveBeenCalled()
  })
})
