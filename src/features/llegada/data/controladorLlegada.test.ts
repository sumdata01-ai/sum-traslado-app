import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResultadoLlegada } from '../domain'
import { ControladorLlegada } from './controladorLlegada'
import { AHORA_DE_PRUEBA, LlegadaApiFalsa, QR_DE_PRUEBA, UbicacionFalsa, fixDePrueba, llegadaConfirmada, respuestaPendiente } from './testing/fakes'

let reloj = AHORA_DE_PRUEBA

beforeEach(() => {
  reloj = AHORA_DE_PRUEBA
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

/** Pasa el tiempo del reloj del controlador y de los temporizadores a la vez. */
async function avanzar(ms: number) {
  reloj += ms
  await vi.advanceTimersByTimeAsync(ms)
}

/** Deja que terminen las promesas pendientes (la respuesta del servidor falso). */
const asentar = () => vi.advanceTimersByTimeAsync(0)

function montar(opciones: { topeEsperaMs?: number } = {}) {
  const api = new LlegadaApiFalsa()
  const ubicacion = new UbicacionFalsa()
  const c = new ControladorLlegada({ api, ubicacion, ahora: () => reloj, ...opciones })
  const etapa = () => c.getSnapshot().etapa
  /** Un fix medido «ahora». */
  const fixAhora = (extra = {}) => fixDePrueba({ momento: reloj, ...extra })
  return { api, ubicacion, c, etapa, fixAhora }
}

/** Empieza y deja un fix reciente listo, como cuando el conductor ya esperó a que el GPS se afinara. */
function escaneando() {
  const m = montar()
  m.c.empezar()
  m.ubicacion.emitir(m.fixAhora())
  return m
}

describe('empezar', () => {
  it('arranca en la explicación y no pide nada al navegador todavía', () => {
    const m = montar()
    expect(m.etapa()).toBe('explicacion')
    expect(m.ubicacion.inicios).toBe(0)
  })

  it('«Permitir» abre el escaneo y empieza a buscar la ubicación, una sola vez', () => {
    const m = montar()
    m.c.empezar()
    expect(m.etapa()).toBe('escaneando')
    expect(m.ubicacion.inicios).toBe(1)
    m.c.empezar()
    expect(m.ubicacion.inicios).toBe(1)
  })

  it('un QR leído antes de empezar se ignora', async () => {
    const m = montar()
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('explicacion')
    expect(m.api.llamadas).toHaveLength(0)
  })

  it('un GPS que no puede ni arrancar no tumba la pantalla: la espera termina en «no se pudo leer tu ubicación»', async () => {
    const api = new LlegadaApiFalsa()
    const c = new ControladorLlegada({
      api,
      ahora: () => reloj,
      ubicacion: {
        iniciar: () => {
          throw new Error('sin GPS')
        },
      },
    })
    c.empezar()
    c.alDetectar(QR_DE_PRUEBA)
    expect(c.getSnapshot().etapa).toBe('buscandoUbicacion')
    await avanzar(30_000)
    expect(c.getSnapshot().etapa).toBe('ubicacionNoDisponible')
  })
})

describe('leer el QR y enviarlo', () => {
  it('con un fix reciente manda el QR y la ubicación, y confirma', async () => {
    const m = escaneando()
    m.api.responder(llegadaConfirmada({ turno: 7 }))

    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()

    expect(m.api.llamadas).toEqual([{ payload: QR_DE_PRUEBA, latitud: -11.902172, longitud: -77.122394, precisionM: 10 }])
    expect(m.etapa()).toBe('confirmada')
    expect(m.c.getSnapshot().confirmada).toMatchObject({ turno: 7, punto: 'Patio de llegada' })
    expect(m.c.getSnapshot().confirmadaEn).toBe(reloj)
  })

  it('manda el texto tal cual: con espacios, saltos de línea y mayúsculas', async () => {
    const m = escaneando()
    const crudo = ' SUM1|7|59698271|S4eYGtymJsriCiZYxmdpHA\n'

    m.c.alDetectar(crudo)
    await asentar()

    expect(m.api.llamadas[0]!.payload).toBe(crudo)
  })

  it('un texto vacío no cuenta', async () => {
    const m = escaneando()
    m.c.alDetectar('')
    await asentar()
    expect(m.etapa()).toBe('escaneando')
    expect(m.api.llamadas).toHaveLength(0)
  })

  it('solo el primer QR cuenta: lo que se lea mientras se envía se ignora y nunca hay dos peticiones a la vez', async () => {
    const m = escaneando()
    const demorada = respuestaPendiente()
    m.api.responder(demorada.promesa)

    m.c.alDetectar(QR_DE_PRUEBA)
    m.c.alDetectar('SUM1|1|59733451|otro')
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('enviando')
    expect(m.api.llamadas).toHaveLength(1)

    demorada.resolver(llegadaConfirmada())
    await asentar()
    m.c.alDetectar('SUM1|1|59733452|tarde') // ya confirmada
    await asentar()

    expect(m.api.llamadas).toHaveLength(1)
    expect(m.api.maximoEnParalelo).toBe(1)
  })

  it('sin un fix reciente espera uno; al llegar, envía', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA)
    expect(m.etapa()).toBe('buscandoUbicacion')
    expect(m.api.llamadas).toHaveLength(0)

    m.ubicacion.emitir(m.fixAhora({ latitud: -11.9, precisionM: 6 }))
    await asentar()

    expect(m.api.llamadas).toEqual([{ payload: QR_DE_PRUEBA, latitud: -11.9, longitud: -77.122394, precisionM: 6 }])
    expect(m.etapa()).toBe('confirmada')
  })

  it('un fix viejo no se usa, aunque sea el único: nunca la última posición conocida', async () => {
    const m = montar()
    m.c.empezar()
    m.ubicacion.emitir(fixDePrueba({ momento: reloj - 20_001 }))

    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()

    expect(m.etapa()).toBe('buscandoUbicacion')
    expect(m.api.llamadas).toHaveLength(0)
  })

  it('un fix que era bueno pero se hizo viejo mientras se esperaba el QR tampoco se usa', async () => {
    const m = escaneando()
    await avanzar(25_000) // el conductor tardó en apuntar a la tablet
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('buscandoUbicacion')
    expect(m.api.llamadas).toHaveLength(0)
  })

  it('un fix viejo que llega durante la espera no dispara el envío', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA)
    m.ubicacion.emitir(fixDePrueba({ momento: reloj - 60_000 }))
    await asentar()
    expect(m.etapa()).toBe('buscandoUbicacion')
    expect(m.api.llamadas).toHaveLength(0)
  })

  it('si en 30 s no llega ninguna ubicación: «no se pudo leer tu ubicación»', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA)

    await avanzar(29_999)
    expect(m.etapa()).toBe('buscandoUbicacion')
    await avanzar(1)

    expect(m.etapa()).toBe('ubicacionNoDisponible')
    expect(m.api.llamadas).toHaveLength(0)
  })

  it('cada espera lleva su número, para reiniciar la barra', () => {
    const m = montar()
    m.c.empezar()
    const antes = m.c.getSnapshot().esperaId
    m.c.alDetectar(QR_DE_PRUEBA)
    expect(m.c.getSnapshot().esperaId).toBe(antes + 1)
  })

  it('el GPS que falla por «sin señal» o «tiempo» no cambia nada: la espera lo resuelve', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA)
    m.ubicacion.fallar('noDisponible')
    m.ubicacion.fallar('tiempo')
    expect(m.etapa()).toBe('buscandoUbicacion')
    m.ubicacion.emitir(m.fixAhora())
    await asentar()
    expect(m.etapa()).toBe('confirmada')
  })

  it('al confirmar suelta el GPS', async () => {
    const m = escaneando()
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.ubicacion.paradas).toBe(1)
    expect(m.ubicacion.escuchando).toBe(false)
  })

  it('un 200 (ya registrada) se confirma igual', async () => {
    const m = escaneando()
    m.api.responder({ ...(llegadaConfirmada() as Extract<ResultadoLlegada, { tipo: 'confirmada' }>), yaRegistrada: true })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('confirmada')
  })
})

describe('los rechazos', () => {
  it('código no válido → escanear de nuevo con otro QR', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'codigoInvalido' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('codigoInvalido')

    m.c.escanearDeNuevo()
    expect(m.etapa()).toBe('escaneando')
    m.c.alDetectar('SUM1|1|59733451|nuevo')
    await asentar()
    expect(m.api.llamadas.map((l) => l.payload)).toEqual([QR_DE_PRUEBA, 'SUM1|1|59733451|nuevo'])
    expect(m.etapa()).toBe('confirmada')
  })

  it('«Reintentar» no hace nada tras un código no válido: reenviar el mismo no sirve', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'codigoInvalido' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    m.c.reintentar()
    m.c.recalcularPosicion()
    await asentar()
    expect(m.api.llamadas).toHaveLength(1)
    expect(m.etapa()).toBe('codigoInvalido')
  })

  it('fuera de zona → «Reintentar con mi posición» descarta la anterior y espera una nueva', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'fueraDeZona' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('fueraDeZona')

    m.c.recalcularPosicion()
    await asentar()
    // No reenvía la misma posición que ya falló: espera una nueva.
    expect(m.etapa()).toBe('buscandoUbicacion')
    expect(m.api.llamadas).toHaveLength(1)

    m.ubicacion.emitir(m.fixAhora({ latitud: -11.9021, precisionM: 4 }))
    await asentar()
    expect(m.api.llamadas).toHaveLength(2)
    expect(m.api.llamadas[1]).toEqual({ payload: QR_DE_PRUEBA, latitud: -11.9021, longitud: -77.122394, precisionM: 4 })
    expect(m.etapa()).toBe('confirmada')
  })

  it('fuera de zona → «Escanear de nuevo» vuelve a la cámara', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'fueraDeZona' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    m.c.escanearDeNuevo()
    expect(m.etapa()).toBe('escaneando')
  })

  it('403 → sin permiso, sin botones que valgan', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'sinPermiso' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('sinPermisoParaLlegada')
    m.c.reintentar()
    m.c.escanearDeNuevo()
    m.c.recalcularPosicion()
    await asentar()
    expect(m.etapa()).toBe('sinPermisoParaLlegada')
    expect(m.api.llamadas).toHaveLength(1)
  })

  it('sesión vencida', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'sesionVencida' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('sesionVencida')
  })
})

describe('sin red y errores', () => {
  it('sin red → «Reintentar» manda el mismo QR (es idempotente) con la ubicación que haya', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'sinRed' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('sinRed')

    m.ubicacion.emitir(m.fixAhora({ precisionM: 3 }))
    m.c.reintentar()
    await asentar()

    expect(m.api.llamadas.map((l) => l.payload)).toEqual([QR_DE_PRUEBA, QR_DE_PRUEBA])
    expect(m.etapa()).toBe('confirmada')
  })

  it('sin red → «Escanear de nuevo» descarta lo leído', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'sinRed' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    m.c.escanearDeNuevo()
    expect(m.etapa()).toBe('escaneando')
    m.c.reintentar() // ya no hay QR que reenviar
    await asentar()
    expect(m.api.llamadas).toHaveLength(1)
  })

  it('un error del servidor → «Reintentar» reenvía', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'error', status: 500 })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('errorInesperado')
    m.c.reintentar()
    await asentar()
    expect(m.etapa()).toBe('confirmada')
  })

  it('si el cliente falla con una excepción, es un error y no se cuelga en «enviando»', async () => {
    const m = escaneando()
    m.api.responder(new Error('boom'))
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('errorInesperado')
    // y se puede reintentar: el candado de «una petición a la vez» se soltó
    m.c.reintentar()
    await asentar()
    expect(m.etapa()).toBe('confirmada')
  })
})

describe('el 422', () => {
  it('se reintenta UNA vez con una posición nueva y, si vuelve a fallar, se ofrece recalcular', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'ubicacionNoLeida' }, { tipo: 'ubicacionNoLeida' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()

    // El primero se reintenta solo, pero con una posición nueva: la que falló se descartó.
    expect(m.etapa()).toBe('buscandoUbicacion')
    expect(m.api.llamadas).toHaveLength(1)
    m.ubicacion.emitir(m.fixAhora({ latitud: -11.95 }))
    await asentar()
    expect(m.api.llamadas).toHaveLength(2)
    expect(m.api.llamadas[1]!.latitud).toBe(-11.95)

    expect(m.etapa()).toBe('ubicacionNoDisponible')
  })

  it('el reintento automático se reinicia con cada QR leído', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'ubicacionNoLeida' }, { tipo: 'ubicacionNoLeida' }, { tipo: 'ubicacionNoLeida' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    m.ubicacion.emitir(m.fixAhora())
    await asentar()
    expect(m.etapa()).toBe('ubicacionNoDisponible')

    m.c.escanearDeNuevo()
    m.ubicacion.emitir(m.fixAhora())
    m.c.alDetectar('SUM1|1|59733451|nuevo')
    await asentar()
    // Un QR nuevo vuelve a tener su reintento: no pasa directo a «no disponible».
    expect(m.etapa()).toBe('buscandoUbicacion')
  })

  it('«Recalcular posición» espera una ubicación nueva y reenvía', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'ubicacionNoLeida' }, { tipo: 'ubicacionNoLeida' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    m.ubicacion.emitir(m.fixAhora())
    await asentar()
    expect(m.etapa()).toBe('ubicacionNoDisponible')

    m.c.recalcularPosicion()
    expect(m.etapa()).toBe('buscandoUbicacion')
    m.ubicacion.emitir(m.fixAhora({ latitud: -11.96 }))
    await asentar()
    expect(m.api.llamadas).toHaveLength(3)
    expect(m.etapa()).toBe('confirmada')
  })
})

describe('precisión insuficiente', () => {
  const insuficiente = (precisionMaxM: number | null): ResultadoLlegada => ({ tipo: 'precisionInsuficiente', precisionMaxM })

  async function esperandoPrecision(maxima: number | null = 50) {
    const m = montar()
    m.c.empezar()
    m.ubicacion.emitir(m.fixAhora({ precisionM: 80 }))
    m.api.responder(insuficiente(maxima))
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    return m
  }

  it('espera un fix mejor, dice cuánta precisión tiene y cuánta se necesita', async () => {
    const m = await esperandoPrecision(50)
    expect(m.etapa()).toBe('esperandoPrecision')
    expect(m.c.getSnapshot()).toMatchObject({ precisionMaxM: 50, precisionActualM: 80 })
  })

  it('un fix que todavía no alcanza solo actualiza la precisión que se ve', async () => {
    const m = await esperandoPrecision(50)
    await avanzar(1000)
    m.ubicacion.emitir(m.fixAhora({ precisionM: 60 }))
    await asentar()
    expect(m.etapa()).toBe('esperandoPrecision')
    expect(m.c.getSnapshot().precisionActualM).toBe(60)
    expect(m.api.llamadas).toHaveLength(1)
  })

  it('un fix que alcanza la precisión pero ya es viejo no se reenvía', async () => {
    const m = await esperandoPrecision(50)
    await avanzar(25_000)
    // Medido un segundo después del que se mandó, pero hace 24 s: no se puede afirmar que sea la posición de ahora.
    m.ubicacion.emitir(fixDePrueba({ momento: AHORA_DE_PRUEBA + 1000, precisionM: 10 }))
    await asentar()
    expect(m.etapa()).toBe('esperandoPrecision')
    expect(m.api.llamadas).toHaveLength(1)
  })

  it('un fix que alcanza se reenvía solo, con el mismo QR', async () => {
    const m = await esperandoPrecision(50)
    await avanzar(1000)
    m.ubicacion.emitir(m.fixAhora({ precisionM: 40 }))
    await asentar()
    expect(m.api.llamadas).toHaveLength(2)
    expect(m.api.llamadas[1]).toMatchObject({ payload: QR_DE_PRUEBA, precisionM: 40 })
    expect(m.etapa()).toBe('confirmada')
  })

  it('exactamente la precisión máxima alcanza', async () => {
    const m = await esperandoPrecision(50)
    await avanzar(1000)
    m.ubicacion.emitir(m.fixAhora({ precisionM: 50 }))
    await asentar()
    expect(m.etapa()).toBe('confirmada')
  })

  it('un fix que no es posterior al que ya se mandó no se reenvía', async () => {
    const m = await esperandoPrecision(50)
    // Misma medición que la mandada (momento igual), aunque ahora diga mejor precisión.
    m.ubicacion.emitir(fixDePrueba({ momento: AHORA_DE_PRUEBA, precisionM: 10 }))
    await asentar()
    expect(m.etapa()).toBe('esperandoPrecision')
    expect(m.api.llamadas).toHaveLength(1)
  })

  it('si ya había un fix bueno cuando llegó el rechazo, se manda de inmediato', async () => {
    const m = montar()
    m.c.empezar()
    m.ubicacion.emitir(m.fixAhora({ precisionM: 80 }))
    const demorada = respuestaPendiente()
    m.api.responder(demorada.promesa)
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()

    await avanzar(500)
    m.ubicacion.emitir(m.fixAhora({ precisionM: 30 })) // llega mientras el servidor contesta
    demorada.resolver(insuficiente(50))
    await asentar()

    expect(m.api.llamadas).toHaveLength(2)
    expect(m.api.llamadas[1]!.precisionM).toBe(30)
  })

  it('si el servidor no dijo la precisión máxima, basta con que sea mejor que la mandada', async () => {
    const m = await esperandoPrecision(null)
    await avanzar(1000)
    m.ubicacion.emitir(m.fixAhora({ precisionM: 90 })) // peor
    await asentar()
    expect(m.etapa()).toBe('esperandoPrecision')
    m.ubicacion.emitir(m.fixAhora({ precisionM: 79 })) // mejor que 80
    await asentar()
    expect(m.api.llamadas).toHaveLength(2)
  })

  it('en 30 s sin mejorar: «no se pudo fijar con precisión»; «Reintentar» vuelve a esperar', async () => {
    const m = await esperandoPrecision(50)
    await avanzar(30_000)
    expect(m.etapa()).toBe('precisionNoAlcanzada')

    const espera = m.c.getSnapshot().esperaId
    m.c.reintentar()
    expect(m.etapa()).toBe('esperandoPrecision')
    expect(m.c.getSnapshot().esperaId).toBe(espera + 1)

    m.ubicacion.emitir(m.fixAhora({ precisionM: 20 }))
    await asentar()
    expect(m.etapa()).toBe('confirmada')
  })

  it('«Escanear de nuevo» tras no alcanzar la precisión descarta lo leído y lo medido', async () => {
    const m = await esperandoPrecision(50)
    await avanzar(30_000)
    m.c.escanearDeNuevo()
    expect(m.etapa()).toBe('escaneando')
    expect(m.c.getSnapshot()).toMatchObject({ precisionMaxM: null, precisionActualM: null })
  })

  it('una segunda precisión insuficiente vuelve a esperar con una espera nueva', async () => {
    const m = montar()
    m.c.empezar()
    m.ubicacion.emitir(m.fixAhora({ precisionM: 80 }))
    m.api.responder(insuficiente(50), insuficiente(50))
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    const espera = m.c.getSnapshot().esperaId
    await avanzar(1000)
    m.ubicacion.emitir(m.fixAhora({ precisionM: 45 })) // alcanza lo que se creía necesario, pero el servidor vuelve a rechazar
    await asentar()
    expect(m.etapa()).toBe('esperandoPrecision')
    expect(m.c.getSnapshot().esperaId).toBeGreaterThan(espera)
  })

  it('la espera termina aunque lleguen fixes: el tope no se renueva con cada uno', async () => {
    const m = await esperandoPrecision(50)
    for (let i = 0; i < 6; i++) {
      await avanzar(5000)
      m.ubicacion.emitir(m.fixAhora({ precisionM: 70 }))
    }
    await asentar()
    expect(m.etapa()).toBe('precisionNoAlcanzada')
  })
})

describe('los temporizadores no se cruzan entre esperas', () => {
  it('una espera cortada por «sin permiso» no acorta la siguiente', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA) // la espera empieza en 0 s
    await avanzar(10_000)
    m.ubicacion.fallar('denegada')
    m.c.reintentarUbicacion()
    await avanzar(2000)
    m.c.alDetectar(QR_DE_PRUEBA) // otra espera, desde los 12 s: vence a los 42 s

    await avanzar(18_500) // 30,5 s desde el principio: la espera vieja ya habría vencido
    expect(m.etapa()).toBe('buscandoUbicacion')
    await avanzar(12_000)
    expect(m.etapa()).toBe('ubicacionNoDisponible')
  })

  it('una espera nueva cancela la anterior', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA) // espera 1, desde 0 s
    await avanzar(10_000)
    m.api.responder({ tipo: 'fueraDeZona' })
    m.ubicacion.emitir(m.fixAhora({ precisionM: 80 }))
    await asentar()
    m.c.recalcularPosicion() // espera 2, desde 10 s: vence a los 40 s

    await avanzar(20_500) // 30,5 s desde el principio
    expect(m.etapa()).toBe('buscandoUbicacion')
  })

  it('salir de la pantalla cancela la espera: al volver a usarla no vence antes', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA) // espera desde 0 s
    await avanzar(5000)
    m.c.dispose()
    m.c.empezar()
    await avanzar(5000)
    m.c.alDetectar(QR_DE_PRUEBA) // espera desde 10 s: vence a los 40 s

    await avanzar(20_500) // 30,5 s desde el principio
    expect(m.etapa()).toBe('buscandoUbicacion')
  })
})

describe('cada botón vale solo en su pantalla', () => {
  it('«Escanear de nuevo» no vuelve a arrancar el GPS que ya está escuchando', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'sinRed' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    m.c.escanearDeNuevo()
    expect(m.etapa()).toBe('escaneando')
    expect(m.ubicacion.inicios).toBe(1)
  })

  it('empezar no hace nada si ya se empezó o ya terminó', async () => {
    const m = escaneando()
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('confirmada')
    m.c.empezar()
    expect(m.etapa()).toBe('confirmada')
    expect(m.ubicacion.inicios).toBe(1)
  })

  it('«Reintentar» del permiso de ubicación no hace nada fuera de esa pantalla', async () => {
    const m = escaneando()
    m.api.responder({ tipo: 'codigoInvalido' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    m.c.reintentarUbicacion()
    expect(m.etapa()).toBe('codigoInvalido')
  })
})

describe('sin permiso de ubicación', () => {
  it('denegada mientras se escanea → pantalla de permiso, y se suelta el GPS', () => {
    const m = montar()
    m.c.empezar()
    m.ubicacion.fallar('denegada')
    expect(m.etapa()).toBe('ubicacionDenegada')
    expect(m.ubicacion.escuchando).toBe(false)
  })

  it('denegada mientras se espera la ubicación → pantalla de permiso y se olvida el QR leído', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA)
    m.ubicacion.fallar('denegada')
    expect(m.etapa()).toBe('ubicacionDenegada')
    await avanzar(31_000) // el tope de la espera ya no corre
    expect(m.etapa()).toBe('ubicacionDenegada')
  })

  it('«Reintentar» vuelve a pedir la ubicación y a escanear', () => {
    const m = montar()
    m.c.empezar()
    m.ubicacion.fallar('denegada')

    m.c.reintentarUbicacion()

    expect(m.etapa()).toBe('escaneando')
    expect(m.ubicacion.inicios).toBe(2)
    expect(m.ubicacion.escuchando).toBe(true)
  })

  it('si se vuelve a negar, vuelve la pantalla de permiso', () => {
    const m = montar()
    m.c.empezar()
    m.ubicacion.fallar('denegada')
    m.c.reintentarUbicacion()
    m.ubicacion.fallar('denegada')
    expect(m.etapa()).toBe('ubicacionDenegada')
  })

  it('«Reintentar» solo vale desde esa pantalla', () => {
    const m = montar()
    m.c.empezar()
    m.c.reintentarUbicacion()
    expect(m.ubicacion.inicios).toBe(1)
  })

  it('negada mientras se envía: se suelta el GPS y el envío sigue; al volver a escanear se vuelve a pedir', async () => {
    const m = escaneando()
    const demorada = respuestaPendiente()
    m.api.responder(demorada.promesa, { tipo: 'codigoInvalido' })
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()

    m.ubicacion.fallar('denegada')
    expect(m.etapa()).toBe('enviando')
    expect(m.ubicacion.escuchando).toBe(false)
    demorada.resolver({ tipo: 'codigoInvalido' })
    await asentar()
    m.c.escanearDeNuevo()
    expect(m.ubicacion.inicios).toBe(2)
  })
})

describe('salir de la pantalla', () => {
  it('suelta el GPS y cancela la espera', async () => {
    const m = montar()
    m.c.empezar()
    m.c.alDetectar(QR_DE_PRUEBA)

    m.c.dispose()
    await avanzar(31_000)

    expect(m.ubicacion.escuchando).toBe(false)
    expect(m.etapa()).toBe('explicacion')
  })

  it('lo que conteste el servidor después ya no cambia nada', async () => {
    const m = escaneando()
    const demorada = respuestaPendiente()
    m.api.responder(demorada.promesa)
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()

    m.c.dispose()
    demorada.resolver(llegadaConfirmada())
    await asentar()

    expect(m.etapa()).toBe('explicacion')
    expect(m.c.getSnapshot().confirmada).toBeNull()
  })

  it('se puede volver a usar (React monta, desmonta y vuelve a montar en desarrollo)', async () => {
    const m = montar()
    m.c.dispose()
    m.c.empezar()
    m.ubicacion.emitir(m.fixAhora())
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    expect(m.etapa()).toBe('confirmada')
  })

  it('una respuesta vieja no suelta el candado de la petición nueva', async () => {
    const m = escaneando()
    const vieja = respuestaPendiente()
    m.api.responder(vieja.promesa)
    m.c.alDetectar(QR_DE_PRUEBA)
    await asentar()
    m.c.dispose()

    m.c.empezar()
    m.ubicacion.emitir(m.fixAhora())
    const nueva = respuestaPendiente()
    m.api.responder(nueva.promesa)
    m.c.alDetectar('SUM1|1|59733451|nuevo')
    await asentar()
    vieja.resolver(llegadaConfirmada()) // llega tarde, ya no corresponde
    await asentar()
    m.c.alDetectar('SUM1|1|59733452|otro') // sigue enviando: no debe abrir una segunda petición
    await asentar()

    expect(m.api.maximoEnParalelo).toBeLessThanOrEqual(2) // la vieja y la nueva pudieron coexistir en el servidor falso
    expect(m.api.llamadas.map((l) => l.payload)).toEqual([QR_DE_PRUEBA, 'SUM1|1|59733451|nuevo'])
  })
})

describe('el store', () => {
  it('avisa a quien se suscribe, entrega instantáneas nuevas y deja de avisar al darse de baja', () => {
    const m = montar()
    const oyente = vi.fn()
    const baja = m.c.suscribir(oyente)
    const antes = m.c.getSnapshot()

    m.c.empezar()

    expect(oyente).toHaveBeenCalled()
    expect(m.c.getSnapshot()).not.toBe(antes)
    expect(m.c.getSnapshot()).toBe(m.c.getSnapshot())

    baja()
    oyente.mockClear()
    m.c.dispose()
    m.c.empezar()
    expect(oyente).not.toHaveBeenCalled()
  })
})
