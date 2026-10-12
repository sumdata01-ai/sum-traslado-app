// @vitest-environment node
/**
 * A-03: una sola sesión en todas las pestañas. Cada «pestaña» es una `AuthCookie` propia (su token
 * en memoria) que comparte con las demás lo que comparte un navegador de verdad: la cookie (el
 * servidor falso), el almacenamiento, el candado del refresh y el canal de avisos.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EstadoSesion } from './AuthPort'
import { AuthCookie } from './authCookie'
import { identidadDelToken } from './identidadToken'
import { AlmacenMemoria, crearBusDePestanas, crearServidorFalso } from './testing/servidorFalso'

const abiertas: AuthCookie[] = []
afterEach(() => {
  for (const pestana of abiertas.splice(0)) pestana.cerrar()
})

function navegador() {
  const servidor = crearServidorFalso()
  const almacen = new AlmacenMemoria()
  const bus = crearBusDePestanas()
  // Como Web Locks: un refresh a la vez entre TODAS las pestañas (el refresh rota la cookie).
  let cola: Promise<unknown> = Promise.resolve()
  const candado = <T,>(tarea: () => Promise<T>): Promise<T> => {
    const resultado = cola.then(tarea)
    cola = resultado.catch(() => undefined)
    return resultado
  }
  const abrir = (opciones: { sinCanal?: boolean } = {}) => {
    const pestana = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado, ...(opciones.sinCanal ? {} : { canal: bus.canal() }) })
    abiertas.push(pestana)
    return pestana
  }
  return { servidor, almacen, bus, abrir }
}

const A = 'usuario.prueba' // id 7 en el servidor falso
const B = 'otra.persona'

/** Abre una pestaña ya con la sesión del navegador (como al abrir otra pestaña y restaurar). */
async function pestanaConSesion(abrir: () => AuthCookie) {
  const pestana = abrir()
  await pestana.restaurar()
  return pestana
}

const estado = (pestana: AuthCookie) => pestana.getSnapshot().estado
const quien = (pestana: AuthCookie) => pestana.getSnapshot().sesion?.usuario
const duenoDelToken = (pestana: AuthCookie) => identidadDelToken(pestana.getToken() ?? '').usuario

describe('AC1 · otra pestaña inicia sesión con otra persona', () => {
  it('esta pestaña pasa sola a la persona nueva, con un token suyo, sin pedir credenciales', async () => {
    const { abrir, servidor } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const pestana2 = await pestanaConSesion(abrir)

    await pestana2.login(B, 'buena')

    await vi.waitFor(() => expect(quien(pestana1)).toBe(B))
    expect(estado(pestana1)).toBe('activa')
    expect(pestana1.getSnapshot().sesion?.idUsuario).toBe(servidor.usuarios.get(B)?.id)
    expect(duenoDelToken(pestana1)).toBe(B) // el token de A se tiró
    expect(servidor.llamadas.login).toBe(2) // nadie volvió a escribir credenciales
  })

  it('mientras cambia, la pestaña pasa por «comprobando» y nunca muestra a la persona anterior como activa', async () => {
    const { abrir } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const pestana2 = await pestanaConSesion(abrir)
    const vistos: Array<[EstadoSesion, string | null | undefined]> = []
    pestana1.suscribir(() => vistos.push([estado(pestana1), quien(pestana1)]))

    await pestana2.login(B, 'buena')
    await vi.waitFor(() => expect(quien(pestana1)).toBe(B))

    expect(vistos[0]).toEqual(['restaurando', undefined])
    expect(vistos.at(-1)).toEqual(['activa', B])
    expect(vistos.filter(([e, u]) => e === 'activa' && u === A)).toEqual([])
  })

  it('si la misma persona vuelve a entrar en otra pestaña, esta sigue igual y no hace un refresh', async () => {
    const { abrir, servidor } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const tokenAntes = pestana1.getToken()
    const pestana2 = abrir()
    const refrescos = servidor.llamadas.refresh

    await pestana2.login(A, 'buena')
    await new Promise((r) => setTimeout(r, 10))

    expect(estado(pestana1)).toBe('activa')
    expect(pestana1.getToken()).toBe(tokenAntes)
    expect(servidor.llamadas.refresh).toBe(refrescos)
  })

  it('el aviso no rebota: la pestaña que cambia de persona no vuelve a anunciarlo', async () => {
    const { abrir, bus } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const pestana2 = await pestanaConSesion(abrir)
    const antes = bus.publicados.length

    await pestana2.login(B, 'buena')
    await vi.waitFor(() => expect(quien(pestana1)).toBe(B))

    expect(bus.publicados.slice(antes)).toEqual([{ tipo: 'entro', idUsuario: expect.any(Number), usuario: B }])
  })

  it('con tres pestañas, las otras dos pasan a la persona nueva', async () => {
    const { abrir } = navegador()
    const p1 = abrir()
    await p1.login(A, 'buena')
    const p2 = await pestanaConSesion(abrir)
    const p3 = await pestanaConSesion(abrir)

    await p3.login(B, 'buena')

    await vi.waitFor(() => {
      expect(quien(p1)).toBe(B)
      expect(quien(p2)).toBe(B)
    })
    // Las tres terminan con un token de B que el servidor acepta: el candado evitó que se pisaran la cookie.
    expect(estado(p1)).toBe('activa')
    expect(estado(p2)).toBe('activa')
    expect(await p1.refrescarSesion()).toBe('ok')
  })

  it('sin red al cambiar: queda «sin conexión» con los datos de la persona nueva, nunca con los de la anterior', async () => {
    const { abrir, servidor, bus } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const pestana2 = abrir()
    await pestana2.login(B, 'buena')
    await vi.waitFor(() => expect(quien(pestana1)).toBe(B))
    servidor.sinRed = true

    bus.canal().publicar({ tipo: 'entro', idUsuario: 999, usuario: 'tercera' }) // otro aviso, ahora sin red

    await vi.waitFor(() => expect(estado(pestana1)).toBe('sinConexion'))
    expect(quien(pestana1)).toBe(B) // lo último que guardó el navegador
    expect(pestana1.getToken()).toBeNull()
  })
})

describe('AC2 · otra pestaña cierra sesión', () => {
  it('esta pestaña va al login y suelta su token, sin llamar ella al servidor', async () => {
    const { abrir, servidor } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const pestana2 = await pestanaConSesion(abrir)

    await pestana2.logout()

    await vi.waitFor(() => expect(estado(pestana1)).toBe('sinSesion'))
    expect(pestana1.getToken()).toBeNull()
    expect(servidor.llamadas.logout).toBe(1)
  })

  it('también si el logout no llegó al servidor por falta de red, y ninguna se restaura sola después', async () => {
    const { abrir, servidor } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const pestana2 = await pestanaConSesion(abrir)
    servidor.sinRed = true

    await pestana2.logout()

    await vi.waitFor(() => expect(estado(pestana1)).toBe('sinSesion'))
    servidor.sinRed = false
    const recargada = abrir()
    await recargada.restaurar()
    expect(estado(recargada)).toBe('sinSesion') // el logout pendiente se completa, no se restaura
  })

  it('un refresh que esta pestaña tenía en curso no la devuelve a la sesión cerrada', async () => {
    const { abrir } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const pestana2 = await pestanaConSesion(abrir)

    const refrescoEnCurso = pestana1.refrescarSesion()
    await pestana2.logout()
    const resultado = await refrescoEnCurso
    await vi.waitFor(() => expect(estado(pestana1)).toBe('sinSesion'))

    expect(resultado).not.toBe('ok')
    expect(pestana1.getToken()).toBeNull()
  })
})

describe('AC3 · una pestaña en el login entra sola cuando otra inicia sesión', () => {
  it('pasa de «sin sesión» a la sesión nueva', async () => {
    const { abrir } = navegador()
    const pestana1 = abrir()
    await pestana1.restaurar()
    expect(estado(pestana1)).toBe('sinSesion')
    const pestana2 = abrir()

    await pestana2.login(B, 'buena')

    await vi.waitFor(() => expect(estado(pestana1)).toBe('activa'))
    expect(quien(pestana1)).toBe(B)
  })
})

describe('AC4 y AC5 · sin aviso, el refresh descubre que la cookie es de otra persona', () => {
  it('la sesión pasa a la persona del token, y no conserva el usuario anterior', async () => {
    const { abrir, servidor } = navegador()
    const pestana1 = abrir({ sinCanal: true }) // el aviso no llega (por ejemplo, un navegador sin canal)
    await pestana1.login(A, 'buena')
    const pestana2 = abrir({ sinCanal: true })
    await pestana2.login(B, 'buena') // la cookie del navegador ahora es de B
    expect(quien(pestana1)).toBe(A) // todavía no se enteró

    expect(await pestana1.refrescarSesion()).toBe('ok')

    expect(quien(pestana1)).toBe(B)
    expect(pestana1.getSnapshot().sesion?.idUsuario).toBe(servidor.usuarios.get(B)?.id)
    expect(pestana1.getSnapshot().sesion?.nombre).toBe(`NOMBRE DE ${B}`)
  })

  it('si el token de otra persona no trae su usuario, no se le pone el de la anterior', async () => {
    const { abrir, servidor } = navegador()
    const pestana1 = abrir({ sinCanal: true })
    await pestana1.login(A, 'buena')
    const pestana2 = abrir({ sinCanal: true })
    await pestana2.login(B, 'buena')
    servidor.tokenConUsuario = false // el token del refresh solo trae `user_id`

    expect(await pestana1.refrescarSesion()).toBe('ok')

    expect(pestana1.getSnapshot().sesion?.idUsuario).toBe(servidor.usuarios.get(B)?.id)
    expect(quien(pestana1)).toBeNull() // desconocido, mejor que el de A
  })

  it('si el token de la misma persona no trae su usuario, se conserva el que ya se sabía', async () => {
    const { abrir, servidor } = navegador()
    const pestana = abrir()
    await pestana.login(A, 'buena')
    servidor.tokenConUsuario = false

    expect(await pestana.refrescarSesion()).toBe('ok')

    expect(quien(pestana)).toBe(A)
  })

  it('un refresh de la misma persona conserva su usuario aunque la respuesta no lo traiga', async () => {
    const { abrir } = navegador()
    const pestana = abrir()
    await pestana.login(A, 'buena')
    expect(await pestana.refrescarSesion()).toBe('ok')
    expect(quien(pestana)).toBe(A)
    expect(pestana.getSnapshot().sesion?.idUsuario).toBe(7)
  })
})

describe('respuestas viejas', () => {
  it('un refresh que empezó antes de un aviso se descarta, y el estado lo decide el aviso', async () => {
    const { abrir, bus } = navegador()
    const pestana = abrir()
    await pestana.login(A, 'buena')

    const viejo = pestana.refrescarSesion()
    bus.canal().publicar({ tipo: 'entro', idUsuario: 999, usuario: 'x' }) // llega mientras el refresh viaja
    const resultadoViejo = await viejo

    expect(resultadoViejo).toBe('sin_conexion') // quien lo pidió lo ve como un fallo de red, no como «ok»
    await vi.waitFor(() => expect(estado(pestana)).toBe('activa'))
    expect(quien(pestana)).toBe(A) // la cookie sigue siendo de A: el refresh de la adopción lo confirma
  })

  it('al restaurar, un aviso que llega a mitad decide el estado (no se queda en «sin conexión»)', async () => {
    const { abrir } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const nueva = abrir()

    const restauracion = nueva.restaurar()
    await pestana1.logout() // mientras la nueva pestaña restaura
    await restauracion

    await vi.waitFor(() => expect(estado(nueva)).toBe('sinSesion'))
  })

  it('un login en esta pestaña descarta un refresh suyo cuya respuesta llega después', async () => {
    const { abrir, servidor } = navegador()
    const pestana = abrir()
    await pestana.login(A, 'buena')
    // El servidor procesa el refresh de A (rota la cookie) pero la respuesta tarda en llegar…
    servidor.retrasoRespuestaRefresh = 40
    const viejo = pestana.refrescarSesion()
    await new Promise((r) => setTimeout(r, 15))

    // …y mientras tanto, en esta misma pestaña, se inicia sesión como B.
    await pestana.login(B, 'buena')
    expect(await viejo).toBe('sin_conexion')

    expect(quien(pestana)).toBe(B)
    expect(duenoDelToken(pestana)).toBe(B) // la respuesta tardía de A no pisó el token de B
  })

  it('un refresh viejo que termina no rompe el «uno a la vez» del refresh nuevo', async () => {
    const { abrir, servidor, bus } = navegador()
    const pestana = abrir()
    await pestana.login(A, 'buena')
    servidor.retrasoRespuestaRefresh = 30
    const refrescosAntes = servidor.llamadas.refresh
    const viejo = pestana.refrescarSesion()
    bus.canal().publicar({ tipo: 'entro', idUsuario: 999, usuario: 'x' }) // empieza otro refresh (la adopción)
    await viejo

    // La adopción sigue en curso: pedir otro refresh debe sumarse a ese, no lanzar uno más.
    await Promise.all([pestana.refrescarSesion(), vi.waitFor(() => expect(estado(pestana)).toBe('activa'))])

    expect(servidor.llamadas.refresh - refrescosAntes).toBe(2) // el viejo y el de la adopción, ninguno más
  })
})

describe('cerrar la pestaña', () => {
  it('después de cerrar() ya no recibe avisos', async () => {
    const { abrir } = navegador()
    const pestana1 = abrir()
    await pestana1.login(A, 'buena')
    const pestana2 = await pestanaConSesion(abrir)
    pestana1.cerrar()

    await pestana2.logout()
    await new Promise((r) => setTimeout(r, 10))

    expect(estado(pestana1)).toBe('activa')
  })
})
